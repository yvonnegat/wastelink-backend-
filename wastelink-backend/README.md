# 🌿 WasteLink Backend

Node.js · Express · Supabase (Postgres + Auth + Storage)

---

## Project Structure

```
src/
├── server.js                    # Entry point
├── app.js                       # Express app, middleware, route registration
│
├── config/
│   ├── supabase.js              # Supabase anon + service-role clients
│   ├── logger.js                # Winston logger
│   ├── schema.sql               # Full Postgres schema (run once)
│   ├── migrate.js               # Migration runner
│   └── seed.js                  # Demo data seeder
│
├── middleware/
│   ├── auth.js                  # protect, requireRole, optionalAuth
│   ├── validate.js              # Zod request validation
│   ├── upload.js                # Multer + Supabase Storage
│   ├── auditLog.js              # Admin audit trail
│   └── errorHandler.js         # Global error handler
│
├── utils/
│   ├── errors.js                # AppError, Errors factory, catchAsync
│   ├── response.js              # send.ok / send.created / send.paginated
│   ├── jwt.js                   # signToken, verifyToken, tokenPair
│   ├── schemas.js               # All Zod validation schemas
│   └── notifications.js        # Notification helper + templates
│
└── modules/
    ├── auth/            POST /register, /login, /refresh, /logout, /me, /change-password
    ├── users/           GET|PATCH /me, GET /:id, PUT /me/recycler-profile
    ├── listings/        Full CRUD + image upload + price accept + status
    ├── recyclers/       Browse, match request, respond to match
    ├── transactions/    List, get, update status machine, rate
    ├── notifications/   List, mark read, delete
    ├── uploads/         General-purpose file upload/delete
    └── admin/           Users, listings, transactions, stats, audit log, broadcast
```

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET

# 3. Run schema in Supabase SQL Editor (copy/paste src/config/schema.sql)
#    OR run the migration script:
npm run db:migrate

# 4. Seed demo data
npm run db:seed

# 5. Start dev server
npm run dev
```

Server runs at **http://localhost:4000**

---

## API Reference

All routes are prefixed with `/api/v1`.

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Login, get JWT |
| POST | `/auth/refresh` | — | Refresh access token |
| POST | `/auth/logout` | ✓ | Logout |
| GET  | `/auth/me` | ✓ | Current user |
| POST | `/auth/change-password` | ✓ | Change password |
| POST | `/auth/forgot-password` | — | Send reset email |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET  | `/users/me` | ✓ | Full profile + recycler profile |
| PATCH | `/users/me` | ✓ | Update profile |
| POST | `/users/me/avatar` | ✓ | Upload avatar image |
| GET  | `/users/:id` | ✓ | Public profile |
| GET  | `/users/me/recycler-profile` | recycler | Get recycler profile |
| PUT  | `/users/me/recycler-profile` | recycler | Create/update recycler profile |
| POST | `/users/me/recycler-profile/certificate` | recycler | Upload certification |

### Listings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET  | `/listings` | opt | Public feed (filter: waste_type, status, condition, qty) |
| GET  | `/listings/my` | seller | Own listings |
| GET  | `/listings/:id` | opt | Single listing detail |
| POST | `/listings` | seller | Create draft |
| PATCH | `/listings/:id` | seller | Update |
| DELETE | `/listings/:id` | seller | Delete + remove images |
| POST | `/listings/:id/images` | seller | Upload up to 5 images |
| DELETE | `/listings/:id/images/:imageId` | seller | Delete image |
| POST | `/listings/:id/accept-price` | seller | Accept ML price |
| POST | `/listings/:id/submit` | seller | Submit draft for verification |

### Recyclers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET  | `/recyclers` | ✓ | Browse recyclers (filter: waste_type, certified) |
| GET  | `/recyclers/:id` | ✓ | Recycler detail |
| POST | `/recyclers/listings/:listingId/request-match` | recycler | Express interest |
| GET  | `/recyclers/matches/incoming` | recycler | Matches I requested |
| GET  | `/recyclers/matches/outgoing` | seller | Match proposals on my listings |
| PATCH | `/recyclers/matches/:matchId/respond` | seller | Accept or reject match |

### Transactions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET  | `/transactions` | ✓ | My transactions (filter: status) |
| GET  | `/transactions/summary/stats` | ✓ | Total value, volume, counts |
| GET  | `/transactions/:id` | ✓ | Single transaction detail |
| PATCH | `/transactions/:id` | ✓ | Update status (state machine) |
| POST | `/transactions/:id/rate` | ✓ | Rate the other party (1–5) |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET  | `/notifications` | ✓ | List (filter: unread=true) |
| GET  | `/notifications/unread-count` | ✓ | Badge count |
| PATCH | `/notifications/:id/read` | ✓ | Mark one read |
| PATCH | `/notifications/read-all` | ✓ | Mark all read |
| DELETE | `/notifications/:id` | ✓ | Delete |

### Uploads
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/uploads/single` | ✓ | Upload one file |
| POST | `/uploads/multiple` | ✓ | Upload up to 10 files |
| DELETE | `/uploads` | ✓ | Delete by storage path |

### Admin (role: admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/admin/stats` | Platform dashboard stats |
| GET  | `/admin/users` | All users (filter: role, is_verified, search) |
| PATCH | `/admin/users/:id` | Update role / verified / active |
| DELETE | `/admin/users/:id` | Deactivate + delete auth |
| GET  | `/admin/listings` | All listings |
| PATCH | `/admin/listings/:id/verify` | Verify listing + inject vision data |
| DELETE | `/admin/listings/:id` | Hard delete |
| GET  | `/admin/transactions` | All transactions |
| GET  | `/admin/audit-logs` | Admin audit trail |
| POST | `/admin/notify-all` | Broadcast notification to all users |

---

## Transaction State Machine

```
initiated
   ├─ recycler → confirmed   (waste collected)
   ├─ recycler → cancelled
   └─ seller  → cancelled

confirmed
   ├─ recycler → completed   (payment received)
   └─ seller  → disputed

disputed
   └─ recycler → completed   (admin resolves)
```

---

## Connecting to the React Frontend

In `wastelink/.env`:
```
REACT_APP_API_URL=http://localhost:4000/api/v1
```

In `pricingService.js` / any service file:
```js
const BASE = process.env.REACT_APP_API_URL;
const res  = await fetch(`${BASE}/listings`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## Supabase Storage

Create a bucket named `wastelink-uploads` in your Supabase project with **public** read access.

Folder structure used:
```
wastelink-uploads/
├── listings/{listing_id}/     # Waste listing photos
├── avatars/{user_id}/         # Profile avatars
├── certificates/{user_id}/    # Recycler certifications
└── users/{user_id}/misc/      # General uploads
```
