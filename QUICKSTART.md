# 🚀 Quick Start Guide

Get your portfolio running in 5 minutes!

## Prerequisites
- Node.js 16+ installed
- Supabase account (free tier is fine)

## 1️⃣ Clone & Install (1 min)

```bash
# Navigate to project
cd mishwa-portfolio

# Install dependencies
npm install
```

## 2️⃣ Configure Environment (2 min)

```bash
# Create .env file
cp .env.example .env
```

**Edit `.env` and add your Supabase credentials:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
NODE_ENV=development
PORT=3000
```

Get credentials from: Supabase > Project Settings > API Keys

## 3️⃣ Run Development Servers (2 min)

**Terminal 1 - Frontend:**
```bash
npm run dev
```
👉 Opens on `http://localhost:5173`

**Terminal 2 - Backend:**
```bash
npm run server
```
👉 Runs on `http://localhost:3000`

## 4️⃣ Create Database Tables

Run this SQL in Supabase Console (SQL Editor):

```sql
CREATE TABLE visitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  latitude FLOAT,
  longitude FLOAT,
  isp TEXT,
  is_vpn BOOLEAN,
  connection_type TEXT,
  timezone TEXT,
  page_viewed TEXT,
  reel_id TEXT,
  session_duration INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_visitors_created_at ON visitors(created_at DESC);
CREATE INDEX idx_visitors_ip ON visitors(ip);
```

Also create a storage bucket:
- Go to Storage > New bucket
- Name: `portfolio-images`
- Make it public

## 5️⃣ Access Admin Dashboard

🔗 `http://localhost:5173/admin/login`

**Default Credentials:**
- Username: `admin`
- Password: `password123`

⚠️ **CHANGE PASSWORD IMMEDIATELY!**
→ Admin > Settings > Change Password

---

## 📚 What Next?

### Common Tasks

**Edit Portfolio Content:**
```
Admin > Content CMS
```

**View Analytics:**
```
Admin > Analytics (real-time visitor data)
```

**Check Security Logs:**
```
Admin > Notifications (all activity logged)
```

**Update Settings:**
```
Admin > Settings > Change Password
Admin > Settings > Clear Analytics
```

### Browse the Site

- **Home**: `http://localhost:5173/`
- **All Reels**: `http://localhost:5173/reels`
- **Admin Login**: `http://localhost:5173/admin/login`
- **Dashboard**: `http://localhost:5173/admin`

---

## 🔧 Troubleshooting

### Port Already in Use?
```bash
# Kill process on port 5173
npx kill-port 5173

# Kill process on port 3000
npx kill-port 3000
```

### Supabase Connection Failed?
- Check `.env` file has correct URL and key
- Verify Supabase project is active
- Check internet connection

### Can't Login?
- Verify database table exists
- Check `server/data/db.json` has auth data
- Try changing password in Settings

### Images Not Uploading?
- Check storage bucket exists and is public
- Verify file is under 5MB
- Check file type is JPEG, PNG, GIF, or WebP

---

## 📚 Full Documentation

- **Setup Details**: See `SETUP.md`
- **Security Info**: See `SECURITY.md`
- **All Changes**: See `CHANGES.md`
- **Implementation**: See `IMPLEMENTATION_COMPLETE.md`

---

## 🎯 Project Structure

```
mishwa-portfolio/
├── src/                 # React frontend
│   ├── components/      # Reusable components
│   ├── pages/           # Page components
│   ├── context/         # React contexts
│   ├── layouts/         # Layout wrappers
│   ├── utils/           # Helper functions
│   ├── lib/             # Library configs
│   └── App.jsx
├── server/              # Express backend
│   ├── index.js         # API endpoints
│   └── data/
│       └── db.json      # Local database
├── public/              # Static files
├── .env                 # Environment vars (not in git)
├── .env.example         # Environment template
├── package.json         # Dependencies
└── vite.config.js       # Vite config
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Frontend loads on localhost:5173
- [ ] Backend runs on localhost:3000
- [ ] Admin login works
- [ ] Can navigate through pages
- [ ] Analytics data appears
- [ ] Can upload images
- [ ] Notifications logged

---

## 🔐 Security Reminders

1. ✅ `.env` file is in `.gitignore` (not committed)
2. ✅ Change default admin password
3. ✅ Use strong passwords
4. ✅ Keep dependencies updated: `npm update`
5. ✅ Never share `.env` file

---

## 🚀 Ready to Deploy?

See `SETUP.md` → **Production Deployment** section

---

## 💡 Pro Tips

**Enable smooth scrolling:**
- Already included with Lenis library

**Enable dark mode:**
- Already applied globally

**Test on mobile:**
```bash
# Get your local IP
# On Windows: ipconfig (look for IPv4 Address)
# Visit http://YOUR_IP:5173 on phone
```

**Check API in browser:**
```
http://localhost:3000/api/content
http://localhost:3000/api/analytics
```

---

## 📞 Need Help?

1. Check `SETUP.md` troubleshooting section
2. Check browser console for errors (F12)
3. Check terminal for server logs
4. Verify `.env` has correct credentials
5. Check network tab in browser DevTools

---

**Happy Coding! 🎨✨**

Need more help? See the full documentation files:
- `SETUP.md` - Comprehensive setup guide
- `SECURITY.md` - Security information
- `CHANGES.md` - All improvements made
