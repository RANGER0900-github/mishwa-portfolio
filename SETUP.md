# Mishwa Portfolio - Video Editor Portfolio & Admin Dashboard

A professional portfolio website for video editors featuring a modern UI, comprehensive analytics, and a powerful CMS admin dashboard.

## 🚀 Tech Stack

- **Frontend**: React 19 + Vite + TailwindCSS + Framer Motion
- **Backend**: Express.js (Node.js)
- **Database**: Supabase (PostgreSQL) with local JSON fallback
- **Security**: Rate limiting, XSS protection, bcrypt password hashing
- **Analytics**: Real-time visitor tracking with geolocation

## 📋 Prerequisites

- Node.js 16+ and npm
- Supabase account with a project created
- GitHub account (for version control)

## 🔧 Setup Instructions

### 1. Environment Configuration

Create a `.env` file in the root directory with your Supabase credentials:

```bash
# Copy from .env.example
cp .env.example .env
```

Then update the `.env` file with your actual values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
NODE_ENV=development
PORT=3000
```

**Never commit `.env` to version control!** It's already in `.gitignore`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup (Supabase)

Create the following tables in your Supabase project:

#### Visitors Table
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

#### Storage Bucket
Create a storage bucket named `portfolio-images` with public access.

### 4. Development Server

Start both frontend and backend:

**Terminal 1 - Frontend:**
```bash
npm run dev
```
Runs on `http://localhost:5173`

**Terminal 2 - Backend:**
```bash
npm run server
```
Runs on `http://localhost:3000`

### 5. Admin Setup

The admin credentials are stored in `server/data/db.json`. Default credentials:
- Username: `admin`
- Password: `password123`

**Change the default password immediately after first login!**

## 📚 Project Structure

```
mishwa-portfolio/
├── src/
│   ├── components/          # React components
│   │   ├── ErrorBoundary.jsx   # Error boundary for graceful error handling
│   │   ├── Navbar.jsx
│   │   ├── Hero.jsx
│   │   ├── Work.jsx
│   │   ├── Cinema.jsx
│   │   ├── Reviews.jsx
│   │   └── ...
│   ├── context/            # React contexts
│   │   ├── LoadingContext.jsx
│   │   └── ContentContext.jsx
│   ├── pages/              # Page components
│   │   ├── Home.jsx
│   │   ├── AllReels.jsx
│   │   └── admin/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── ContentCMS.jsx
│   │       ├── Analytics.jsx
│   │       ├── Notifications.jsx
│   │       └── Settings.jsx
│   ├── layouts/            # Layout components
│   ├── utils/              # Utility functions
│   │   ├── apiUtils.js        # Retry logic, validation, sanitization
│   │   └── linkUtils.js
│   ├── lib/                # Library configurations
│   │   └── supabaseClient.js
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   └── App.css
├── server/
│   ├── index.js            # Express server with API endpoints
│   └── data/
│       └── db.json         # Local database (JSON fallback)
├── public/                 # Static assets
├── .env                    # Environment variables (not committed)
├── .env.example            # Environment template
├── .gitignore
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 🔐 Security Features

- **Rate Limiting**: 100 requests per minute per IP
- **XSS Protection**: Input sanitization and pattern blocking
- **Password Security**: Bcrypt password hashing (10 salt rounds)
- **CORS**: Configured for safe cross-origin requests
- **Security Headers**: Set Content-Type, Frame-Options, XSS-Protection
- **Input Validation**: Strict validation on all API endpoints
- **Environment Variables**: Sensitive data kept out of codebase

## 📊 API Endpoints

### Public Endpoints
- `GET /api/content` - Fetch portfolio content
- `POST /api/track` - Track visitor with analytics
- `POST /api/track/heartbeat` - Update session duration
- `POST /api/track/reel` - Track reel clicks
- `POST /api/login` - Admin login

### Admin Endpoints (Requires authentication)
- `POST /api/content` - Update portfolio content
- `POST /api/upload` - Upload images to storage
- `GET /api/analytics` - Fetch analytics with pagination (page, limit)
- `GET /api/notifications` - Fetch notifications
- `POST /api/notifications/:id/read` - Mark notification as read
- `DELETE /api/notifications/:id` - Delete notification
- `POST /api/notifications/clear` - Clear all notifications
- `POST /api/settings/password` - Change admin password
- `POST /api/settings/clear-analytics` - Clear analytics data

### Query Parameters
- `/api/analytics?page=1&limit=50` - Paginated analytics (default: page 1, 50 items)

## 🎨 Customization

### Colors
Edit `tailwind.config.js` to change the color scheme:
```js
colors: {
  background: '#020c1b',    // Deep Navy
  primary: '#64ffda',       // Cyan
  secondary: '#00f3ff',     // Bright Cyan
  accent: '#bd34fe',        // Purple
}
```

### Content
Edit portfolio content through the Admin CMS:
1. Navigate to `/admin/content`
2. Add/edit projects, reviews, and social links
3. Click "Save" to update

## 📈 Analytics

The analytics dashboard provides:
- Real-time visitor tracking
- Device breakdown (mobile/desktop)
- Geographic distribution
- Session duration analysis
- Reel click tracking
- Export to CSV/JSON

**Note**: Analytics are paginated (50 items per page by default) for better performance with large datasets.

## 🛠️ Improvements Made

### Critical Security Fixes
✅ Moved Supabase API keys to `.env` file
✅ Implemented bcrypt for password hashing
✅ Added strict input validation on all endpoints
✅ Enhanced file upload validation

### Code Quality
✅ Added Error Boundary component for graceful error handling
✅ Implemented retry logic with exponential backoff
✅ Created utility functions for validation and sanitization
✅ Removed unused dependencies (tooltip)
✅ Cleaned up boilerplate CSS
✅ Added password visibility toggle in login

### Performance
✅ Implemented pagination for analytics
✅ Added environment variable support
✅ Optimized database queries

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
npx kill-port 3000
# Kill process on port 5173
npx kill-port 5173
```

### Database Connection Issues
- Verify Supabase credentials in `.env`
- Check database tables are created correctly
- Ensure storage bucket exists and is public

### Login Issues
- Check `server/data/db.json` exists
- Verify bcrypt hashing is working
- Check network tab for API response

### Image Upload Issues
- Verify storage bucket exists
- Check bucket permissions are public
- Ensure file is under 5MB
- Verify file type is supported (JPEG, PNG, GIF, WebP)

## 📝 Environment Variables Reference

```env
# Supabase Configuration
VITE_SUPABASE_URL              # Your Supabase project URL
VITE_SUPABASE_ANON_KEY        # Your Supabase anon key

# Server Configuration
NODE_ENV                        # development or production
PORT                           # Server port (default: 3000)
```

## 🚀 Production Deployment

### Frontend (Vite)
```bash
npm run build
npm run preview
```

### Backend
```bash
NODE_ENV=production npm run server
```

### Environment
Set the following in your production environment:
- `VITE_SUPABASE_URL` - Production Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Production Supabase key
- `NODE_ENV=production`
- `PORT` - Your production port

## 📞 Support

For issues or questions, check the troubleshooting section or review the code comments throughout the project.

## 📄 License

This project is private. All rights reserved.

## 🎯 Future Enhancements

- [ ] Email notifications for new analytics
- [ ] Social media integration
- [ ] Advanced filtering in analytics
- [ ] Testimonials/case studies section
- [ ] Newsletter subscription
- [ ] SEO optimization
- [ ] Mobile app version
