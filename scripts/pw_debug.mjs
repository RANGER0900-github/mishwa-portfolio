import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const toSafeStamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const withForwardSlashes = (p) => p.replace(/\\/g, '/');
const relativeTo = (root, filePath) => withForwardSlashes(path.relative(root, filePath));

const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
};

const writeText = (filePath, text) => fs.writeFileSync(filePath, String(text ?? ''), 'utf8');
const writeJson = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      s.close(() => resolve(port));
    });
  });

const RUN_HEARTBEAT_MS = 5000;
const RUN_DEFAULT_TIMEOUT_MS = Number(process.env.PW_CMD_TIMEOUT_MS || 10 * 60 * 1000);

const run = (cmd, args, { cwd, env, label, timeoutMs } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const effectiveTimeout = Number(timeoutMs || RUN_DEFAULT_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      if (!label) return;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(`[${label}] running... ${elapsed}s`);
    }, RUN_HEARTBEAT_MS);

    const killer = setTimeout(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      child.kill();
      const timeoutError = new Error(`${label || cmd} timed out after ${elapsed}s`);
      timeoutError.code = 'ETIMEDOUT';
      reject(timeoutError);
    }, effectiveTimeout);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearInterval(heartbeat);
      clearTimeout(killer);
      reject(err);
    });
    child.on('close', (code) => {
      clearInterval(heartbeat);
      clearTimeout(killer);
      const result = { code: Number(code ?? 0), stdout, stderr };
      if (label) {
        const out = stdout.trim();
        const err = stderr.trim();
        if (out) console.log(`[${label}] ${out.split('\n').slice(-6).join('\n')}`);
        if (err) console.error(`[${label}:err] ${err.split('\n').slice(-8).join('\n')}`);
      }
      resolve(result);
    });
  });

// Avoid spawning *.cmd/*.ps1 wrappers (Windows) by invoking npm/npx via node directly.
const nodeBin = process.execPath;
const nodeDir = path.dirname(nodeBin);
const npmCli = process.env.npm_execpath || path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(npmCli), 'npx-cli.js');

const pwcliArgs = (session, args) => [
  npxCli,
  '--yes',
  '--package',
  '@playwright/cli',
  'playwright-cli',
  '--session',
  session,
  ...args
];

const runPw = async ({ session, args, cwd, env, stepId }) => {
  const safeStep = stepId.replace(/[^a-z0-9_.-]+/gi, '_');
  const outPath = path.join(cwd, `${safeStep}.${args[0]}.cli.txt`);

  const res = await run(nodeBin, pwcliArgs(session, args), { cwd, env, label: `pw:${safeStep}:${args[0]}` });
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`.trimEnd();
  writeText(outPath, combined);

  return {
    ...res,
    combined,
    outPath,
    outRel: relativeTo(cwd, outPath)
  };
};

const fetchJsonWithTimeout = async (url, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
};

const startServer = async ({ port, dbPath, envOverrides, outputDir }) => {
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
    // Keep E2E analytics local by default.
    ANALYTICS_STORAGE_MODE: 'local',
    DISABLE_SUPABASE_ANALYTICS: 'true',
    DB_PATH: dbPath,
    ...envOverrides
  };

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const serverLogPath = path.join(outputDir, 'server.log');
  const logStream = fs.createWriteStream(serverLogPath, { flags: 'a' });

  let started = false;
  const logs = [];

  const onData = (d) => {
    const s = d.toString();
    logs.push(s);
    logStream.write(s);
    if (!started && s.includes('Server running')) started = true;
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && !started; i += 1) {
    await wait(100);
  }

  if (!started) {
    child.kill();
    logStream.end();
    throw new Error(`Server failed to start. See ${serverLogPath}\n\n${logs.join('')}`);
  }

  return {
    child,
    serverLogPath,
    stop: () => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      try {
        logStream.end();
      } catch {
        // ignore
      }
    }
  };
};

const makeConfig = ({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, extraHTTPHeaders, headless }) => ({
  browser: {
    launchOptions: {
      headless: typeof headless === 'boolean' ? headless : true
    },
    contextOptions: {
      viewport,
      ...(typeof userAgent === 'string' ? { userAgent } : null),
      ...(typeof isMobile === 'boolean' ? { isMobile } : null),
      ...(typeof hasTouch === 'boolean' ? { hasTouch } : null),
      ...(typeof deviceScaleFactor === 'number' ? { deviceScaleFactor } : null),
      ...(extraHTTPHeaders && typeof extraHTTPHeaders === 'object' ? { extraHTTPHeaders } : null),
      ignoreHTTPSErrors: true
    }
  }
});

const compactRunCode = (raw) => String(raw).replace(/\s+/g, ' ').trim();

const extractCliErrorMessage = (combinedOut) => {
  const idx = String(combinedOut || '').indexOf('### Error');
  if (idx === -1) return null;
  const tail = String(combinedOut || '').slice(idx);
  const cleaned = tail.replace(/^.*### Error\s*/s, '').trim();
  return cleaned.split('\n').slice(0, 12).join('\n').trim() || 'Playwright CLI reported an error.';
};

const extractPageInfo = (combinedOut) => {
  const pageUrl = String(combinedOut || '').match(/- Page URL:\s*(.+)\s*$/m)?.[1]?.trim() || null;
  const pageTitle = String(combinedOut || '').match(/- Page Title:\s*(.+)\s*$/m)?.[1]?.trim() || null;
  return { url: pageUrl, title: pageTitle };
};

const extractMarkdownLinkPath = (combinedOut, label) => {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[${esc}\\]\\(([^)]+)\\)`, 'i');
  return String(combinedOut || '').match(re)?.[1]?.trim() || null;
};

const parseConsoleLogHeader = (text) => {
  const m = String(text || '').match(/Total messages:\s*(\d+)\s*\(Errors:\s*(\d+),\s*Warnings:\s*(\d+)\)/i);
  if (!m) return { total: null, errors: null, warnings: null };
  return { total: Number(m[1]), errors: Number(m[2]), warnings: Number(m[3]) };
};

const parseNetworkLog = (text, { ignore = [] } = {}) => {
  const failures = [];
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^\[(\w+)\]\s+(\S+)\s+=>\s+\[(\d+)\]\s*(.*)$/i);
    if (!m) continue;
    const method = m[1].toUpperCase();
    const url = m[2];
    const status = Number(m[3]);
    const statusText = m[4] || '';

    const isIgnored = ignore.some((rule) => {
      if (!rule) return false;
      const statusOk = typeof rule.status === 'number' ? status === rule.status : true;
      const urlOk = typeof rule.urlIncludes === 'string' ? url.includes(rule.urlIncludes) : true;
      return statusOk && urlOk;
    });

    if (status >= 400 && !isIgnored) {
      failures.push({ method, url, status, statusText });
    }
  }

  const had5xx = failures.some((f) => f.status >= 500);
  return { failures: failures.slice(0, 30), totalRequests: lines.length, had5xx };
};

const captureConsoleAndNetwork = async ({ session, outputDir, stepId, env }) => {
  const consoleCli = await runPw({ session, args: ['console'], cwd: outputDir, env, stepId: `${stepId}.console` });
  const consoleLogRel = extractMarkdownLinkPath(consoleCli.combined, 'Console');
  const consoleLogAbs = consoleLogRel ? path.resolve(outputDir, consoleLogRel) : null;
  const consoleLog = consoleLogAbs ? readText(consoleLogAbs) : '';
  const consoleCounts = parseConsoleLogHeader(consoleLog);

  const networkCli = await runPw({ session, args: ['network'], cwd: outputDir, env, stepId: `${stepId}.network` });
  const networkLogRel = extractMarkdownLinkPath(networkCli.combined, 'Network');
  const networkLogAbs = networkLogRel ? path.resolve(outputDir, networkLogRel) : null;
  const networkLog = networkLogAbs ? readText(networkLogAbs) : '';
  const networkParsed = parseNetworkLog(networkLog, { ignore: [{ status: 404, urlIncludes: '/does-not-exist' }] });

  return {
    console: {
      cliOutputPath: consoleCli.outRel,
      logPath: consoleLogRel ? withForwardSlashes(consoleLogRel) : null,
      ...consoleCounts
    },
    network: {
      cliOutputPath: networkCli.outRel,
      logPath: networkLogRel ? withForwardSlashes(networkLogRel) : null,
      ...networkParsed
    }
  };
};

const ensureScreenshotOrFallback = async ({ session, outputDir, stepId, expectedRelPath, env }) => {
  if (expectedRelPath) {
    const abs = path.resolve(outputDir, expectedRelPath);
    if (fs.existsSync(abs)) {
      return { screenshot: withForwardSlashes(expectedRelPath), fallbackCliOutputPath: null };
    }
  }

  const ssCli = await runPw({ session, args: ['screenshot'], cwd: outputDir, env, stepId: `${stepId}.screenshot` });
  const ssRel = extractMarkdownLinkPath(ssCli.combined, 'Screenshot of viewport');
  return {
    screenshot: ssRel ? withForwardSlashes(ssRel) : null,
    fallbackCliOutputPath: ssCli.outRel
  };
};

const runScenario = async ({ session, outputDir, profileName, scenario, env, adminPassword }) => {
  const stepId = `${profileName}.${scenario.name}`;
  const record = {
    name: scenario.name,
    ok: true,
    skipped: false,
    errorMessage: null,
    cliOutputPath: null,
    runCodePath: null,
    page: { url: null, title: null },
    screenshot: null,
    screenshots: null,
    trace: null,
    console: null,
    network: null
  };

  const shouldRun = typeof scenario.shouldRun === 'function' ? scenario.shouldRun({ profileName, adminPassword }) : true;
  if (!shouldRun) {
    record.skipped = true;
    return record;
  }

  const runCode = scenario.makeRunCode({ outputDir, profileName, adminPassword });
  const runCodePath = path.join(outputDir, `${stepId}.run-code.js`.replace(/[^a-z0-9_.-]+/gi, '_'));
  writeText(runCodePath, runCode);
  record.runCodePath = relativeTo(outputDir, runCodePath);

  let traceStarted = false;
  if (process.env.PW_TRACE === '1') {
    const startTrace = await runPw({ session, args: ['tracing-start'], cwd: outputDir, env, stepId: `${stepId}.trace-start` });
    record.trace = { startCliOutputPath: startTrace.outRel, stopCliOutputPath: null, tracePath: null };
    traceStarted = startTrace.code === 0 && !extractCliErrorMessage(startTrace.combined);
  }

  const runRes = await runPw({ session, args: ['run-code', runCode], cwd: outputDir, env, stepId });
  record.cliOutputPath = runRes.outRel;
  record.page = extractPageInfo(runRes.combined);

  const cliError = extractCliErrorMessage(runRes.combined);
  if (cliError || runRes.code !== 0) {
    record.ok = false;
    record.errorMessage = cliError || `Playwright CLI exit code ${runRes.code}`;
  }

  if (traceStarted) {
    const stopTrace = await runPw({ session, args: ['tracing-stop'], cwd: outputDir, env, stepId: `${stepId}.trace-stop` });
    const traceRel = extractMarkdownLinkPath(stopTrace.combined, 'Trace') || extractMarkdownLinkPath(stopTrace.combined, 'Tracing') || null;
    record.trace = record.trace || { startCliOutputPath: null, stopCliOutputPath: null, tracePath: null };
    record.trace.stopCliOutputPath = stopTrace.outRel;
    record.trace.tracePath = traceRel ? withForwardSlashes(traceRel) : null;
  }

  if (Array.isArray(scenario.expectedScreenshots) && scenario.expectedScreenshots.length > 0) {
    record.screenshots = scenario.expectedScreenshots
      .filter((p) => fs.existsSync(path.resolve(outputDir, p)))
      .map((p) => withForwardSlashes(p));
  } else if (scenario.expectedScreenshot) {
    const ss = await ensureScreenshotOrFallback({
      session,
      outputDir,
      stepId,
      expectedRelPath: scenario.expectedScreenshot,
      env
    });
    record.screenshot = ss.screenshot;
    if (!record.screenshot && record.ok) {
      record.ok = false;
      record.errorMessage = record.errorMessage || 'Expected screenshot was not produced.';
    }
  }

  const evidence = await captureConsoleAndNetwork({ session, outputDir, stepId, env });
  record.console = evidence.console;
  record.network = evidence.network;

  const consoleErrors = Number(record.console?.errors ?? 0);
  const allowedConsoleErrors = (() => {
    if (scenario.allowConsoleErrors === true) return Number.POSITIVE_INFINITY;
    if (Number.isFinite(Number(scenario.allowConsoleErrors))) return Number(scenario.allowConsoleErrors);
    return 0;
  })();

  if (consoleErrors > allowedConsoleErrors) {
    record.ok = false;
    record.errorMessage = record.errorMessage || `Console errors detected: ${consoleErrors}`;
  }

  if (record.network?.had5xx) {
    record.ok = false;
    record.errorMessage = record.errorMessage || 'Network 5xx failures detected.';
  }

  return record;
};

const makePublicLoadRunCode = ({ baseUrl, outputDir, screenshotRel, fullPage }) => {
  const screenshotPath = withForwardSlashes(path.join(outputDir, screenshotRel));
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const artifactPath = ${JSON.stringify(screenshotPath)};

    const resp = await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    if (!resp || resp.status() >= 500) throw new Error('Home failed to load.');
    await page.waitForSelector('text=MISHWA', { timeout: 20000 });

    const pre = page.locator('[data-testid="preloader"]');
    if (await pre.count()) {
      await pre.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    }

    await page.waitForTimeout(600);
    const visitId = await page.evaluate(() => sessionStorage.getItem('portfolioVisitId'));
    if (!visitId) throw new Error('Expected sessionStorage.portfolioVisitId to be set (tracking not working).');

    await page.screenshot({ path: artifactPath, fullPage: ${fullPage ? 'true' : 'false'}, timeout: 20000 });
  }`;
  return compactRunCode(raw);
};

const makePublicNavRunCode = ({ baseUrl, outputDir, screenshotRel, fullPage }) => {
  const screenshotPath = withForwardSlashes(path.join(outputDir, screenshotRel));
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const artifactPath = ${JSON.stringify(screenshotPath)};
    const goto = async (url) => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      return resp;
    };

    await goto(baseUrl + '/');
    await page.waitForSelector('text=MISHWA', { timeout: 20000 });
    const pre = page.locator('[data-testid="preloader"]');
    if (await pre.count()) {
      await pre.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    }

    const menuButton = page.getByRole('button', { name: /open menu|close menu/i });
    if (await menuButton.count()) {
      const allReelsVisible = await page.getByRole('link', { name: 'All Reels' }).first().isVisible().catch(() => false);
      if (!allReelsVisible) await menuButton.first().click();
    }

    await page.getByRole('link', { name: 'All Reels' }).first().click();
    await page.waitForURL('**/reels', { timeout: 20000 });
    await page.waitForSelector('text=Archives', { timeout: 20000 });
    await page.locator('.break-inside-avoid').first().click({ timeout: 20000 });
    await page.waitForURL('**/project/**', { timeout: 20000 });
    await page.waitForSelector('article h1', { timeout: 20000 });

    await page.screenshot({ path: artifactPath, fullPage: ${fullPage ? 'true' : 'false'}, timeout: 20000 });
  }`;
  return compactRunCode(raw);
};

const makePublicSeoRunCode = ({ baseUrl, outputDir, screenshotRel, fullPage }) => {
  const screenshotPath = withForwardSlashes(path.join(outputDir, screenshotRel));
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const artifactPath = ${JSON.stringify(screenshotPath)};
    const goto = async (url) => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      return resp;
    };

    await goto(baseUrl + '/reels');
    await page.waitForSelector('text=Archives', { timeout: 20000 });
    await page.locator('.break-inside-avoid').first().click({ timeout: 20000 });
    await page.waitForURL('**/project/**', { timeout: 20000 });
    await page.waitForSelector('article h1', { timeout: 20000 });
    const headingRaw = await page.locator('article h1').first().innerText().catch(() => '');
    const normalize = (value) => String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const heading = normalize(headingRaw);
    const headingProbe = heading.split(' ').slice(0, 2).join(' ');

    await goto(page.url());
    await page.waitForSelector('article h1', { timeout: 20000 });
    const titleAfterReload = await page.title();
    const normalizedTitle = normalize(titleAfterReload);
    if (headingProbe && !normalizedTitle.includes(headingProbe)) {
      throw new Error('Expected document.title to include project heading after reload. Got: \"' + titleAfterReload + '\"');
    }

    const robotsResp = await page.request.get(baseUrl + '/robots.txt');
    if (robotsResp.status() !== 200) throw new Error('Expected /robots.txt to be 200');
    const sitemapResp = await page.request.get(baseUrl + '/sitemap.xml');
    if (sitemapResp.status() !== 200) throw new Error('Expected /sitemap.xml to be 200');

    await page.screenshot({ path: artifactPath, fullPage: ${fullPage ? 'true' : 'false'}, timeout: 20000 });
  }`;
  return compactRunCode(raw);
};

const makePublicPerfRunCode = ({ baseUrl, expectedPerf, expectLenis = null }) => {
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=MISHWA', { timeout: 20000 });
    const perf = await page.evaluate(() => document.documentElement.dataset.perf || null);
    const hasLenis = await page.evaluate(() => Boolean(window.lenis));
    const expectedPerf = ${JSON.stringify(expectedPerf)};
    const expectLenis = ${expectLenis === null ? 'null' : expectLenis ? 'true' : 'false'};
    if (perf !== expectedPerf) throw new Error('Expected data-perf=' + expectedPerf + ' but got ' + perf);
    if (expectLenis !== null && hasLenis !== expectLenis) throw new Error('Expected window.lenis=' + expectLenis + ' but got ' + hasLenis);
  }`;
  return compactRunCode(raw);
};

const makePublic404RunCode = ({ baseUrl }) => {
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const notFoundResp = await page.request.get(baseUrl + '/does-not-exist');
    if (notFoundResp.status() !== 404) throw new Error('Expected /does-not-exist to return HTTP 404.');
    const robotsTag = String(notFoundResp.headers()['x-robots-tag'] || '').toLowerCase();
    if (!robotsTag.includes('noindex')) throw new Error('Expected /does-not-exist to include X-Robots-Tag: noindex.');
  }`;
  return compactRunCode(raw);
};

const makeAdminLoginRunCode = ({ baseUrl, outputDir, screenshotRel, adminPassword }) => {
  const screenshotPath = withForwardSlashes(path.join(outputDir, screenshotRel));
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const artifactPath = ${JSON.stringify(screenshotPath)};
    const adminPassword = ${JSON.stringify(adminPassword || '')};
    if (!adminPassword) return;

    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));

    await page.goto(baseUrl + '/admin/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Welcome Back.', { timeout: 20000 });
    await page.locator('input[name=\"username\"]').fill('admin');
    await page.locator('input[name=\"password\"]').fill(adminPassword);
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL('**/admin', { timeout: 20000 });
    await page.waitForSelector('text=/Dashboard/i', { timeout: 20000 });

    const cookies = await page.context().cookies();
    if (!cookies.some((c) => c && c.name === 'admin_session')) {
      throw new Error('Expected admin_session cookie to exist after login.');
    }

    await page.screenshot({ path: artifactPath, fullPage: false, timeout: 20000 });
  }`;
  return compactRunCode(raw);
};

const makeAdminNavRunCode = ({ baseUrl, outputDir, screenshotMap, adminPassword }) => {
  const shots = Object.fromEntries(
    Object.entries(screenshotMap).map(([k, rel]) => [k, withForwardSlashes(path.join(outputDir, rel))])
  );

  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const adminPassword = ${JSON.stringify(adminPassword || '')};
    if (!adminPassword) return;

    const shots = ${JSON.stringify(shots)};

    const goto = async (p) => {
      const resp = await page.goto(baseUrl + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      return resp;
    };

    await goto('/admin/content');
    await page.waitForSelector('text=Content CMS', { timeout: 20000 });
    await page.screenshot({ path: shots.content, fullPage: false, timeout: 20000 });

    await goto('/admin/analytics');
    await page.waitForSelector('text=Analytics', { timeout: 20000 });
    await page.screenshot({ path: shots.analytics, fullPage: false, timeout: 20000 });

    await goto('/admin/notifications');
    await page.waitForSelector('text=Notifications', { timeout: 20000 });
    await page.screenshot({ path: shots.notifications, fullPage: false, timeout: 20000 });

    await goto('/admin/settings');
    await page.waitForSelector('text=Settings', { timeout: 20000 });
    await page.screenshot({ path: shots.settings, fullPage: false, timeout: 20000 });
  }`;

  return compactRunCode(raw);
};

const makeAdminOverlapRunCode = ({ baseUrl, outputDir, profileName, adminPassword }) => {
  const outDirFs = withForwardSlashes(outputDir);
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const profileName = ${JSON.stringify(profileName)};
    const adminPassword = ${JSON.stringify(adminPassword || '')};
    if (!adminPassword) return;

    const bottomNavSelector = '[data-testid=\"admin-bottom-nav\"]';

    const pages = [
      { key: 'dashboard', path: '/admin' },
      { key: 'content', path: '/admin/content' },
      { key: 'analytics', path: '/admin/analytics' },
      { key: 'notifications', path: '/admin/notifications' },
      { key: 'settings', path: '/admin/settings' }
    ];

    const waitForReady = async (key) => {
      if (key === 'content') await page.waitForSelector('text=Content CMS', { timeout: 20000 });
      else await page.waitForSelector('text=' + key.charAt(0).toUpperCase() + key.slice(1), { timeout: 20000 }).catch(() => {});
      await page.waitForSelector(bottomNavSelector, { timeout: 20000 });
    };

    const scrollToRatio = async (ratio) => {
      await page.evaluate((r) => {
        const max = Math.max(0, document.body.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.floor(max * r));
      }, ratio);
      await page.waitForTimeout(300);
    };

    const shot = async (name) => {
      const rel = profileName + '.admin-overlap.' + name + '.png';
      await page.screenshot({ path: ${JSON.stringify(outDirFs)} + '/' + rel, fullPage: false, timeout: 20000 });
      return rel;
    };

    const assertNotObscured = async () => {
      const payload = await page.evaluate((sel) => {
        const nav = document.querySelector(sel);
        if (!nav) return { ok: true, reason: 'no_nav' };
        const navRect = nav.getBoundingClientRect();
        const root = document.querySelector('main');
        if (!root) return { ok: true, reason: 'no_main' };
        const candidates = Array.from(root.querySelectorAll('a,button,input,textarea,select,[role=\"button\"],[tabindex]'));
        const visible = candidates
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.bottom > 0 && x.r.top < window.innerHeight);
        const last = visible.sort((a, b) => b.r.bottom - a.r.bottom)[0];
        if (!last) return { ok: true, reason: 'no_focusable' };
        const margin = 6;
        const ok = last.r.bottom <= (navRect.top - margin);
        return { ok, navTop: navRect.top, lastBottom: last.r.bottom };
      }, bottomNavSelector);

      if (!payload.ok) {
        throw new Error('Bottom nav is overlapping content. navTop=' + payload.navTop + ' lastBottom=' + payload.lastBottom);
      }
    };

    for (const entry of pages) {
      await page.goto(baseUrl + entry.path, { waitUntil: 'domcontentloaded' });
      await waitForReady(entry.key);

      await scrollToRatio(0);
      await shot(entry.key + '-top');

      await scrollToRatio(0.5);
      await shot(entry.key + '-mid');

      await scrollToRatio(1);
      await shot(entry.key + '-bottom');
      await assertNotObscured();
    }
  }`;

  return compactRunCode(raw);
};

const makeAdminClearAnalyticsRunCode = ({ baseUrl, adminPassword }) => {
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const adminPassword = ${JSON.stringify(adminPassword || '')};
    if (!adminPassword) return;

    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));

    await page.goto(baseUrl + '/admin/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Settings', { timeout: 20000 });
    await page.getByRole('button', { name: 'Clear Data' }).click();

    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(350);
      const r = await page.request.get(baseUrl + '/api/settings/analytics-count');
      const j = await r.json().catch(() => null);
      if (j?.success && Number(j.total || 0) === 0) break;
    }

    const countAfterResp = await page.request.get(baseUrl + '/api/settings/analytics-count');
    const countAfter = await countAfterResp.json().catch(() => null);
    if (!countAfter?.success || Number(countAfter.total || 0) !== 0) {
      throw new Error('Expected analytics-count to be 0 after Clear Data.');
    }

    const analyticsResp = await page.request.get(baseUrl + '/api/analytics?limit=10&page=1');
    const analyticsJson = await analyticsResp.json().catch(() => null);
    if (analyticsJson?.visits && Array.isArray(analyticsJson.visits) && analyticsJson.visits.length !== 0) {
      throw new Error('Expected /api/analytics to return 0 visits after Clear Data.');
    }
  }`;
  return compactRunCode(raw);
};

const makeSecurityBlockAndAppealRunCode = ({ baseUrl, outputDir, screenshotRel }) => {
  const screenshotPath = withForwardSlashes(path.join(outputDir, screenshotRel));
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const artifactPath = ${JSON.stringify(screenshotPath)};

    const payload = { username: "admin' OR 1=1 --", password: "x" };
    for (let i = 0; i < 3; i += 1) {
      await page.request.post(baseUrl + '/api/login', { data: payload }).catch(() => null);
      await page.waitForTimeout(150);
    }

    const resp = await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    if (!resp || resp.status() !== 403) {
      throw new Error('Expected home to be blocked with HTTP 403 after injection attempts.');
    }
    await page.waitForSelector('text=Access Temporarily Blocked', { timeout: 20000 });

    await page.screenshot({ path: artifactPath, fullPage: false, timeout: 20000 });

    await page.locator('#appeal-message').fill('I am testing security. Please unblock.');
    await page.locator('#appeal-contact').fill('test@example.com');
    await page.locator('#appeal-submit').click();
    await page.waitForSelector('text=Appeal submitted.', { timeout: 20000 });
  }`;
  return compactRunCode(raw);
};

const makeSecurityVerifyAppealNotificationRunCode = ({ baseUrl, adminPassword }) => {
  const raw = String.raw`async (page) => {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    const baseUrl = ${JSON.stringify(baseUrl)};
    const adminPassword = ${JSON.stringify(adminPassword || '')};
    if (!adminPassword) return;

    await page.goto(baseUrl + '/admin/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Welcome Back.', { timeout: 20000 });
    await page.locator('input[name=\"username\"]').fill('admin');
    await page.locator('input[name=\"password\"]').fill(adminPassword);
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL('**/admin', { timeout: 20000 });

    const r = await page.request.get(baseUrl + '/api/notifications');
    const j = await r.json().catch(() => null);
    const list = Array.isArray(j?.notifications) ? j.notifications : [];
    const hasAppeal = list.some((n) => String(n?.type || '').toLowerCase() === 'appeal' || String(n?.title || '').toLowerCase().includes('appeal'));
    if (!hasAppeal) throw new Error('Expected an appeal notification to exist after appeal submission.');
  }`;
  return compactRunCode(raw);
};

const runMainSuite = async ({ outputDir, adminPassword }) => {
  // Copy DB into the output folder so E2E runs never touch the repo DB.
  const dbSource = path.join(repoRoot, 'server', 'data', 'db.json');
  const dbPath = path.join(outputDir, 'db.json');
  fs.copyFileSync(dbSource, dbPath);

  if (!process.env.SKIP_BUILD) {
    console.log('Building app...');
    const res = await run(nodeBin, [npmCli, 'run', 'build'], { cwd: repoRoot, label: 'build' });
    if (res.code !== 0) {
      throw new Error(`Build failed (exit ${res.code}).\n${res.stderr}\n${res.stdout}`.trim());
    }
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Starting server on ${baseUrl}...`);

  const server = await startServer({ port, dbPath, outputDir });
  const env = process.env;

  const health = await fetchJsonWithTimeout(`${baseUrl}/api/health`, 5000);
  if (!health.ok || health.json?.status !== 'ok' || health.json?.hasDist !== true) {
    throw new Error(`Preflight failed: /api/health not OK. status=${health.status} payload=${JSON.stringify(health.json)}`);
  }

  const headed = process.env.PW_HEADED === '1';
  const configs = [
    {
      session: `mishwa-${path.basename(outputDir)}-desktop`,
      name: 'desktop-chrome',
      browser: 'chrome',
      fullPage: true,
      config: makeConfig({ viewport: { width: 1440, height: 900 }, headless: !headed })
    },
    {
      session: `mishwa-${path.basename(outputDir)}-mobile`,
      name: 'mobile-chrome',
      browser: 'chrome',
      fullPage: false,
      config: makeConfig({
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        headless: !headed
      })
    },
    {
      session: `mishwa-${path.basename(outputDir)}-ios`,
      name: 'ios-sim-chrome',
      browser: 'chrome',
      fullPage: false,
      config: makeConfig({
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        headless: !headed
      })
    }
  ];

  const summaries = [];

  try {
    for (const entry of configs) {
      const configPath = path.join(outputDir, `${entry.name}.playwright-cli.json`);
      writeJson(configPath, entry.config);

      console.log(`\n[${entry.name}] opening browser...`);
      await runPw({ session: entry.session, args: ['delete-data'], cwd: outputDir, env, stepId: `${entry.name}.delete-data` });
      const openRes = await runPw({
        session: entry.session,
        args: ['open', baseUrl, '--browser', entry.browser, '--config', configPath],
        cwd: outputDir,
        env,
        stepId: `${entry.name}.open`
      });
      if (openRes.code !== 0) {
        throw new Error(`Playwright CLI failed to open browser for ${entry.name}. See ${openRes.outRel}`);
      }

      const record = { profile: entry.name, browser: entry.browser, steps: [] };

      const publicScenarios = [
        {
          name: 'public-load',
          expectedScreenshot: `${entry.name}.public-load.png`,
          makeRunCode: () =>
            makePublicLoadRunCode({
              baseUrl,
              outputDir,
              screenshotRel: `${entry.name}.public-load.png`,
              fullPage: entry.fullPage
            })
        },
        {
          name: 'public-nav',
          expectedScreenshot: `${entry.name}.public-nav.png`,
          makeRunCode: () =>
            makePublicNavRunCode({
              baseUrl,
              outputDir,
              screenshotRel: `${entry.name}.public-nav.png`,
              fullPage: entry.fullPage
            })
        },
        {
          name: 'public-seo',
          expectedScreenshot: `${entry.name}.public-seo.png`,
          makeRunCode: () =>
            makePublicSeoRunCode({
              baseUrl,
              outputDir,
              screenshotRel: `${entry.name}.public-seo.png`,
              fullPage: entry.fullPage
            })
        },
        {
          name: 'public-perf-tier',
          makeRunCode: () =>
            makePublicPerfRunCode({
              baseUrl,
              expectedPerf: entry.name === 'ios-sim-chrome' ? 'lite' : 'full',
              expectLenis: entry.name === 'desktop-chrome' ? null : false
            })
        },
        {
          name: 'public-404-noindex',
          makeRunCode: () => makePublic404RunCode({ baseUrl })
        }
      ];

      for (const scenario of publicScenarios) {
        console.log(`[${entry.name}] scenario: ${scenario.name}`);
        const step = await runScenario({
          session: entry.session,
          outputDir,
          profileName: entry.name,
          scenario,
          env,
          adminPassword
        });
        record.steps.push(step);
        if (!step.ok) break;
      }

      const shouldRunAdmin =
        Boolean(adminPassword) &&
        (env.PW_ADMIN_ALL === '1' || entry.name === 'mobile-chrome' || entry.name === 'ios-sim-chrome');

      if (shouldRunAdmin) {
        const overlapShots = ['dashboard', 'content', 'analytics', 'notifications', 'settings'].flatMap((key) => [
          `${entry.name}.admin-overlap.${key}-top.png`,
          `${entry.name}.admin-overlap.${key}-mid.png`,
          `${entry.name}.admin-overlap.${key}-bottom.png`
        ]);

        const adminScenarios = [
          {
            name: 'admin-login',
            expectedScreenshot: `${entry.name}.admin-login.png`,
            makeRunCode: () =>
              makeAdminLoginRunCode({
                baseUrl,
                outputDir,
                screenshotRel: `${entry.name}.admin-login.png`,
                adminPassword
              })
          },
          {
            name: 'admin-nav',
            expectedScreenshots: [
              `${entry.name}.admin-content.png`,
              `${entry.name}.admin-analytics.png`,
              `${entry.name}.admin-notifications.png`,
              `${entry.name}.admin-settings.png`
            ],
            makeRunCode: () =>
              makeAdminNavRunCode({
                baseUrl,
                outputDir,
                adminPassword,
                screenshotMap: {
                  content: `${entry.name}.admin-content.png`,
                  analytics: `${entry.name}.admin-analytics.png`,
                  notifications: `${entry.name}.admin-notifications.png`,
                  settings: `${entry.name}.admin-settings.png`
                }
              })
          },
          {
            name: 'admin-mobile-overlap',
            expectedScreenshots: overlapShots,
            makeRunCode: () => makeAdminOverlapRunCode({ baseUrl, outputDir, profileName: entry.name, adminPassword }),
            shouldRun: ({ profileName }) => profileName === 'mobile-chrome' || profileName === 'ios-sim-chrome'
          },
          {
            name: 'admin-clear-analytics',
            makeRunCode: () => makeAdminClearAnalyticsRunCode({ baseUrl, adminPassword })
          }
        ];

        for (const scenario of adminScenarios) {
          console.log(`[${entry.name}] scenario: ${scenario.name}`);
          const step = await runScenario({
            session: entry.session,
            outputDir,
            profileName: entry.name,
            scenario,
            env,
            adminPassword
          });
          record.steps.push(step);
          if (!step.ok) break;
        }
      }

      summaries.push(record);
      await runPw({ session: entry.session, args: ['close'], cwd: outputDir, env, stepId: `${entry.name}.close` });
    }
  } finally {
    server.stop();
  }

  return { baseUrl, summaries };
};

const runSecuritySuite = async ({ outputDir, adminPassword }) => {
  const securityDir = path.join(outputDir, 'security');
  ensureDir(securityDir);

  const dbSource = path.join(repoRoot, 'server', 'data', 'db.json');
  const dbPath = path.join(securityDir, 'db.json');
  fs.copyFileSync(dbSource, dbPath);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n[security] Starting isolated server on ${baseUrl}...`);

  const server = await startServer({ port, dbPath, outputDir: securityDir });
  const env = process.env;

  const health = await fetchJsonWithTimeout(`${baseUrl}/api/health`, 5000);
  if (!health.ok || health.json?.status !== 'ok') {
    throw new Error(`Security preflight failed: /api/health not OK. status=${health.status} payload=${JSON.stringify(health.json)}`);
  }

  const headed = process.env.PW_HEADED === '1';
  const blockedIp = '10.0.0.5';
  const adminIp = '10.0.0.6';

  const blockedSession = `mishwa-${path.basename(outputDir)}-security-blocked`;
  const adminSession = `mishwa-${path.basename(outputDir)}-security-admin`;

  const blockedConfig = makeConfig({
    viewport: { width: 1200, height: 800 },
    headless: !headed,
    extraHTTPHeaders: { 'x-forwarded-for': blockedIp }
  });

  const adminConfig = makeConfig({
    viewport: { width: 1200, height: 800 },
    headless: !headed,
    extraHTTPHeaders: { 'x-forwarded-for': adminIp }
  });

  const blockedConfigPath = path.join(securityDir, 'security-blocked.playwright-cli.json');
  const adminConfigPath = path.join(securityDir, 'security-admin.playwright-cli.json');
  writeJson(blockedConfigPath, blockedConfig);
  writeJson(adminConfigPath, adminConfig);

  const suite = { suite: 'security', baseUrl, steps: [] };

  try {
    console.log('[security] blocked-ip scenario: auto-block + appeal');
    await runPw({ session: blockedSession, args: ['delete-data'], cwd: securityDir, env, stepId: 'security.blocked.delete-data' });
    const blockedOpen = await runPw({
      session: blockedSession,
      args: ['open', baseUrl, '--browser', 'chrome', '--config', blockedConfigPath],
      cwd: securityDir,
      env,
      stepId: 'security.blocked.open'
    });
    if (blockedOpen.code !== 0) {
      throw new Error(`Playwright CLI failed to open browser for security blocked session. See ${blockedOpen.outRel}`);
    }

    const blockStep = await runScenario({
      session: blockedSession,
      outputDir: securityDir,
      profileName: 'security-blocked',
      scenario: {
        name: 'security-block-and-appeal',
        allowConsoleErrors: true,
        expectedScreenshot: 'security-blocked.blocked.png',
        makeRunCode: () => makeSecurityBlockAndAppealRunCode({ baseUrl, outputDir: securityDir, screenshotRel: 'security-blocked.blocked.png' })
      },
      env,
      adminPassword
    });
    suite.steps.push(blockStep);
    await runPw({ session: blockedSession, args: ['close'], cwd: securityDir, env, stepId: 'security.blocked.close' });

    if (adminPassword) {
      console.log('[security] admin scenario: verify appeal notification');
      await runPw({ session: adminSession, args: ['delete-data'], cwd: securityDir, env, stepId: 'security.admin.delete-data' });
      const adminOpen = await runPw({
        session: adminSession,
        args: ['open', baseUrl, '--browser', 'chrome', '--config', adminConfigPath],
        cwd: securityDir,
        env,
        stepId: 'security.admin.open'
      });
      if (adminOpen.code !== 0) {
        throw new Error(`Playwright CLI failed to open browser for security admin session. See ${adminOpen.outRel}`);
      }

      const verifyStep = await runScenario({
        session: adminSession,
        outputDir: securityDir,
        profileName: 'security-admin',
        scenario: {
          name: 'security-verify-appeal-notification',
          makeRunCode: () => makeSecurityVerifyAppealNotificationRunCode({ baseUrl, adminPassword })
        },
        env,
        adminPassword
      });
      suite.steps.push(verifyStep);
      await runPw({ session: adminSession, args: ['close'], cwd: securityDir, env, stepId: 'security.admin.close' });
    }
  } finally {
    server.stop();
  }

  return suite;
};

const main = async () => {
  const stamp = toSafeStamp();
  const outputDir = path.join(repoRoot, 'output', 'playwright', `debug-${stamp}`);
  ensureDir(outputDir);

  const adminPassword = process.env.E2E_ADMIN_PASSWORD || '';
  const mainResult = await runMainSuite({ outputDir, adminPassword });
  const securityResult = await runSecuritySuite({ outputDir, adminPassword });

  const summaryPath = path.join(outputDir, 'summary.json');
  writeJson(summaryPath, {
    baseUrl: mainResult.baseUrl,
    ranAt: new Date().toISOString(),
    summaries: mainResult.summaries,
    suites: [securityResult]
  });

  console.log(`\nDebug run finished. Artifacts: ${outputDir}`);
  console.log(`Summary: ${summaryPath}`);
};

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
