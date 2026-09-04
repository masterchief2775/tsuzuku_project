# Tsuzuku 🎌

**Tsuzuku** is a modern anime tracking and watchlist application designed to help you keep track of the series you are watching, manage your personal profile, connect with friends, and share your anime lists.

🌐 **Live application:** https://tsuzukuproject.vercel.app

## ✨ Features

* 📺 **Anime watchlist** — keep track of your anime and organize your progress.
* 👤 **User profiles** — customize your username, display name, biography, avatar, and profile visibility.
* 👥 **Friends** — connect with other users and discover what they are watching.
* 🔎 **Public profiles** — browse profiles and shared anime lists.
* 🔗 **Shareable lists** — share your anime list through dedicated share links.
* 🔐 **Authentication** — account creation and sign-in powered by Better Auth.
* 💾 **Persistent database** — user and application data are stored in PostgreSQL in deployed environments.
* 📱 **Responsive interface** — designed to work across desktop and mobile screen sizes.

## 🛠️ Tech Stack

### Frontend

* [React](https://react.dev/)
* [TypeScript](https://www.typescriptlang.org/)
* [TanStack Start](https://tanstack.com/start)
* [TanStack Router](https://tanstack.com/router)
* [TanStack Query](https://tanstack.com/query)
* [Tailwind CSS](https://tailwindcss.com/)
* [Radix UI](https://www.radix-ui.com/)
* [Lucide React](https://lucide.dev/)

### Backend & Data

* [Better Auth](https://www.better-auth.com/) — authentication and session management
* [PostgreSQL](https://www.postgresql.org/) — production database
* [Kysely](https://kysely.dev/) — type-safe SQL queries
* [PGLite](https://pglite.dev/) — local/live-preview database fallback

### Tooling & Deployment

* [Vite](https://vite.dev/)
* [ESLint](https://eslint.org/)
* [Prettier](https://prettier.io/)
* [Playwright](https://playwright.dev/)
* [Vercel](https://vercel.com/) — deployment

## 📁 Project Structure

```text
src/
├── components/       # Reusable UI components
├── lib/              # Application logic, database and authentication
├── routes/           # TanStack Start application routes
├── store/            # Client-side state
├── router.tsx        # Router configuration
└── styles.css        # Global styles
```

### Main Routes

| Route           | Description                 |
| --------------- | --------------------------- |
| `/`             | Main anime list / dashboard |
| `/login`        | Authentication              |
| `/profile`      | Current user's profile      |
| `/friends`      | Friends and social features |
| `/u/:username`  | Public user profile         |
| `/share/:token` | Shared list/profile link    |
| `/api/auth/*`   | Better Auth API endpoints   |

## 🚀 Getting Started

### Prerequisites

* Node.js
* npm
* A PostgreSQL database for a production-style local setup

### Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/masterchief2775/tsuzuku_project.git
cd tsuzuku_project
npm install
```

### Environment Variables

Create a `.env.local` file and configure the required environment variables:

```env
DATABASE_URL=your_postgresql_connection_string
BETTER_AUTH_URL=http://localhost:8080
BETTER_AUTH_SECRET=your_secret
```

For a deployed instance, `BETTER_AUTH_URL` should contain the public application URL.

> ⚠️ **Never commit `.env`, `.env.local`, database credentials, or authentication secrets to Git.**

### Database

Run the application's migrations with:

```bash
npm run db:migrate
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:8080
```

## 📜 Available Scripts

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Start the development server                      |
| `npm run build`      | Build the application and run database migrations |
| `npm run preview`    | Preview the production build                      |
| `npm run db:migrate` | Run database migrations                           |
| `npm run typecheck`  | Run TypeScript type checking                      |
| `npm run lint`       | Run ESLint                                        |
| `npm run test`       | Run the test suite                                |
| `npm run check:auth` | Validate authentication configuration             |
| `npm run format`     | Format the project with Prettier                  |

## 🔐 Authentication

Tsuzuku uses **Better Auth** for account and session management.

Authentication endpoints are exposed through:

```text
/api/auth/*
```

The deployed application uses PostgreSQL for persistent authentication data.

The application also supports a local/live-preview database fallback when a PostgreSQL connection is not configured.

## 🗄️ Database & Migrations

Database migrations are stored in the:

```text
migrations/
```

directory and are executed by the project's migration script.

To apply migrations manually:

```bash
npm run db:migrate
```

The application uses **Kysely** for database access and **PostgreSQL** in production.

## 🧪 Testing & Quality

Before submitting changes, it is recommended to run:

```bash
npm run typecheck
npm run lint
npm run test
```

You can also run the authentication configuration check:

```bash
npm run check:auth
```

## 🌍 Deployment

Tsuzuku is designed to be deployed on **Vercel**.

Typical deployment requirements include:

1. Connect the GitHub repository to Vercel.
2. Configure the required environment variables.
3. Set `BETTER_AUTH_URL` to the deployed application's URL.
4. Configure `DATABASE_URL` with the production PostgreSQL connection string.
5. Deploy the project.

### Production Environment Variables

```env
DATABASE_URL=your_production_database_url
BETTER_AUTH_URL=https://tsuzukuproject.vercel.app
BETTER_AUTH_SECRET=your_production_secret
```

> 🔒 Keep all production secrets private and never commit them to the repository.

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome!

### 1. Fork the repository

Create your own fork of the project.

### 2. Create a feature branch

```bash
git checkout -b feature/my-feature
```

### 3. Make your changes

Implement your feature or fix.

### 4. Run the checks

```bash
npm run typecheck
npm run lint
npm run test
```

### 5. Commit your changes

```bash
git add .
git commit -m "Add my feature"
```

### 6. Push your branch

```bash
git push origin feature/my-feature
```

Then open a Pull Request.

## 📄 License

No license has currently been specified for this project.

## 💙 About Tsuzuku

Tsuzuku is built to make anime tracking more social, personal, and enjoyable — whether you are keeping a private watchlist or sharing your anime journey with friends.

---

**Tsuzuku 🎌 — Keep watching. Keep tracking. Keep going.**
