# Smart Healthcare Project Management and Monitoring System

Node.js and Express backend with MongoDB/Mongoose persistence. The Express application serves the plain HTML/CSS/vanilla JavaScript frontend and its API from the same origin.

## Requirements

- Node.js 18 or later and npm
- MongoDB running locally or a reachable MongoDB deployment

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a local environment file and set the MongoDB URI:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and configure `MONGODB_URI`. `PORT` defaults to `5000`; configure `CLIENT_ORIGIN`, `NODE_ENV`, and the CPI/SPI thresholds there as needed. `.env` is ignored by Git.

3. Load the healthcare case-study data:

   ```powershell
   npm run seed
   ```

4. Start the combined website and API:

   ```powershell
   npm start
   ```

5. Open [http://localhost:5000](http://localhost:5000).

For development with automatic server restarts, run `npm run dev`.

## Tests

Run the complete Jest/Supertest suite against an ephemeral MongoDB replica set:

```powershell
npm test
```

The tests use `mongodb-memory-server`; they do not need the configured application database.

## API

Generic collection endpoints are available at `/api/:collection` for `projects`, `milestones`, `teamMembers`, `requirements`, `wbsNodes`, `changeRequests`, `activities`, `defects`, `checklists`, `inspections`, `risks`, `pdpcNodes`, and `settings`. Business endpoints, health reporting, JSON response shape and query parameters are documented in [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

The frontend calls same-origin `/api` endpoints through `js/api.js`; MongoDB is the persistent source of truth. Run `npm run seed` to restore the initial case-study dataset.
