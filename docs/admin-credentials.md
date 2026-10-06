# Admin Credentials & Database Setup

This file records the administrator account credentials configured for the platform and synchronized directly with the MongoDB database (`pickleball_booking`).

---

## 🛡️ Admin Login Credentials

| Field                | Value                  |
| -------------------- | ---------------------- |
| **Admin ID (Email)** | `admin@pickleball.com` |
| **Password**         | `Admin@12345`          |
| **Role**             | `admin`                |
| **Status**           | `active`               |

_(Secondary admin account: `kingaadarsh5@gmail.com` with password `Admin@12345`)_

---

## ⚙️ Configuration File Locations

1. **Environment Configuration (`.env`)**:

   ```env
   ADMIN_EMAIL=admin@pickleball.com
   ADMIN_PASSWORD=Admin@12345
   ```

2. **Backend Config Validation**:
   - `apps/api/src/config/index.ts`

3. **Automatic Database Bootstrap**:
   - `apps/api/src/config/admin-bootstrap.ts`
   - Automatically synchronizes the admin account and password hash into MongoDB collection `users` every time the server starts up.

4. **Seed Script**:
   - `scripts/seed.ts`

---

## 🚀 How to Access Admin Panel

1. Go to the **Sign in** page (`/login`).
2. Enter the Admin ID: `admin@pickleball.com`
3. Enter the Password: `Admin@12345`
4. Click **Sign in**.
5. The application will detect the `admin` role and redirect directly to the **Admin Dashboard** (`/admin`).
