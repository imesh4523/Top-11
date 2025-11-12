# Overview

This project is a full-stack, real-time color prediction betting game. Players can place bets on colors, numbers, or size categories within timed rounds, receiving live updates via WebSockets. The application supports multiple concurrent bets and provides users with a demo balance to start. The business vision is to create an engaging and accessible online betting platform with real-time interaction, aiming for broad market potential in the online gaming sector.

# User Preferences

Preferred communication style: Simple, everyday language (Sinhala/English mix accepted).

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript, using Vite.
- **UI Components**: Shadcn/ui and Radix UI for accessible components.
- **Styling**: Tailwind CSS with dark theme and CSS custom properties.
- **State Management**: TanStack Query for server state, React local state for UI.
- **Routing**: Wouter for client-side routing.
- **Real-time**: WebSocket hook for live updates.

## Backend Architecture
- **Server**: Express.js with TypeScript on Node.js.
- **API Design**: RESTful for user, game, and betting operations.
- **Real-time**: WebSocket server for broadcasting game states and results.
- **Game Logic**: Server-side state management with automatic round progression.
- **Real-time Database Sync**: Automatic real-time synchronization of critical data operations to backup databases:
    - Service auto-initializes on server startup
    - Sync hooks integrated for all critical operations (user balance updates, transactions, bets)
    - Queue-based system ensures reliable sync even under high load
    - Admin can add/manage multiple backup database connections
    - Sync activates automatically when connections are marked as active
    - Comprehensive logging for monitoring sync status and troubleshooting
- **Digital Ocean Integration**: Admin dashboard integration for managing Digital Ocean Droplets, including fetching server details, refreshing the list, and deploying applications to specific or all servers. This includes real-time deployment status updates and secure API key management via Replit Secrets.
- **Nginx Load Balancer**: Comprehensive load balancing configuration UI in the admin dashboard allowing admins to:
    - Select load balancing methods (Round Robin, Least Connections, IP Hash)
    - Configure individual server weights for traffic distribution
    - Preview generated Nginx configuration before deployment
    - Deploy load balancer to primary server with one-click setup
    - Automatic backend server registration from active droplets
    - Support for health checks and auto-failover
    - WebSocket-aware configuration for real-time features
- **VIP Level System**: Users progress through VIP levels based on either referral count or deposit amount. VIP settings are real-time synchronized across the server and clients via WebSockets, ensuring instant updates to bet limits and commission rates for all players.
- **Notification System**: Comprehensive notification system with database storage, RESTful API endpoints for sending and retrieving notifications (broadcast or targeted), and a UI component for displaying notifications with real-time updates.
- **User Geography**: Improved IP detection for accurate country data capture, even in development environments, enhancing analytics.
- **Email System**: Comprehensive email service with dual configuration options:
    - SMTP support with database configuration
    - SendGrid integration for professional email delivery
    - Admin dashboard configuration for both SMTP and SendGrid
    - Email statistics tracking (total emails sent)
    - Test email functionality to verify configuration
    - Automatic email counter for monitoring usage
    - Support for password reset, deposit confirmation, and VIP upgrade emails
- **Admin Features**:
    - Enhanced user management with auto-refreshing lists and formatted balance displays.
    - Accurate transaction display for agent deposits.
    - Admin predictions now properly recorded in betting history.
    - User report PDF generation for detailed user data.
    - Intuitive toggle for Telegram Signals integration.
    - Admin actions are logged for audit trails.
    - Database connection management for real-time sync configuration
    - SendGrid email configuration and monitoring in Settings tab

## Data Storage Solutions
- **ORM**: Drizzle ORM configured for PostgreSQL, with type-safe schema definitions.
- **Database**: PostgreSQL with dual driver support:
  - Neon serverless driver for Replit/Neon databases
  - Standard PostgreSQL driver for Digital Ocean and other managed databases
  - Automatic driver selection based on connection URL
- **Schema**: Comprehensive schema (`shared/schema.ts`) with 19 tables, including users, games, bets, transactions, referrals, agents, admin audit logs, analytics, sessions, settings, withdrawals, passkeys, notifications, and VIP configurations.
- **Schema Management**: `npm run db:push` for migrations.

## Authentication and Authorization
- **User System**: Demo user creation for immediate access.
- **Session Management**: Cookie-based sessions using connect-pg-simple.
- **Security**: Basic user identification.

# External Dependencies

- **Database**: PostgreSQL (Neon serverless driver).
- **UI Framework**: Radix UI.
- **Development Tools**: Replit-specific plugins, ESBuild, TypeScript.
- **Form Handling**: React Hook Form with Zod validation.
- **Deployment**: Digital Ocean API for VPS management and application deployment.

# Production Deployment

## Digital Ocean App Platform Ready ✅

The application is fully configured and tested for Digital Ocean App Platform deployment with managed PostgreSQL:

### Database Configuration
- **Multi-Database Support**: 
  - ✅ Replit PostgreSQL (Neon-backed) for development
  - ✅ Digital Ocean Managed PostgreSQL for production
  - ✅ Automatic driver selection (Neon vs standard PostgreSQL)
  - ✅ Environment variable priority: DO_DATABASE_URL → DATABASE_URL
- **Connection Status**: ✅ Digital Ocean database connected and verified
- **Migration Support**: ✅ Migrations work with both Neon and standard PostgreSQL
- **Schema**: ✅ All tables synced using `npm run db:push`

## Security Configuration
- **Balance Encryption**: ✅ BALANCE_ENCRYPTION_KEY configured
- **Session Security**: ✅ SESSION_SECRET configured
- **CORS**: Configured for Replit, Digital Ocean, and custom domains:
  - `*.replit.app`
  - `*.replit.dev`
  - `*.ondigitalocean.app`
  - Custom domains via CUSTOM_DOMAIN env var
- **Helmet**: HTTP security headers enabled for production
- **Rate Limiting**: Adaptive rate limiting with IP reputation scoring
- **Country Blocking**: Configurable blacklist/whitelist mode

## Production Environment Variables

### Required for Digital Ocean:
```bash
NODE_ENV=production
DO_DATABASE_URL=postgresql://user:pass@host:port/db?sslmode=require
DATABASE_URL=${DO_DATABASE_URL}
SESSION_SECRET=<generated-with-openssl-rand-base64-32>
BALANCE_ENCRYPTION_KEY=<generated-with-openssl-rand-hex-32>
```

### Required for Replit:
```bash
NODE_ENV=production
DATABASE_URL=<auto-set-by-replit>
SESSION_SECRET=<auto-set-by-replit>
BALANCE_ENCRYPTION_KEY=<your-key>
```

### Optional but Recommended:
```bash
CLOUDFLARE_ENABLED=true
CLOUDFLARE_STRICT=true
CUSTOM_DOMAIN=https://yourdomain.com

# Email (if using SendGrid)
SENDGRID_API_KEY=<your-key>
FROM_EMAIL=<your-email>

# Telegram (if using)
TELEGRAM_BOT_TOKEN=<your-token>
TELEGRAM_CHAT_ID=<your-chat-id>
```

## Build Process
- Production build created with: `npm run build`
- Output: `dist/` directory with optimized frontend and backend bundles
- Frontend bundle: ~1.7 MB (minified)
- Backend bundle: ~707 KB

## Production Checklist
- ✅ Production build created
- ✅ Database connected and migrated (Replit & Digital Ocean)
- ✅ Environment variables configured
- ✅ Schema synced to database
- ✅ Server tested on port 5000
- ✅ All dependencies installed
- ✅ Balance encryption configured
- ✅ Multi-database driver support active
- ✅ CORS configured for all platforms
- ✅ Digital Ocean deployment ready

## Known Configuration
- Server binds to: 0.0.0.0:5000 (required for Replit and Digital Ocean deployment)
- WebSocket support: Enabled
- Real-time sync: Active for database operations
- Self-healing system: Auto-fixes LSP errors and runtime issues
- Multi-platform deployment: Replit, Digital Ocean App Platform, VPS

## Deployment Documentation
- **Digital Ocean App Platform**: See `DIGITALOCEAN-DEPLOYMENT-GUIDE.md`
- **VPS Deployment**: See `VPS-DEPLOYMENT-GUIDE-SINHALA.md`
- **Production Settings**: See `PRODUCTION-DEPLOYMENT-GUIDE.md`
- **Security**: See `SECURITY-SUMMARY.md`

## Recent Changes (Nov 09, 2025)
- ✅ Added Digital Ocean database support with DO_DATABASE_URL
- ✅ Implemented automatic database driver selection (Neon/PostgreSQL)
- ✅ Updated migration scripts for multi-database compatibility
- ✅ Added Digital Ocean domain support in CORS configuration
- ✅ Created comprehensive Digital Ocean deployment guide
- ✅ Verified full compatibility with Digital Ocean App Platform