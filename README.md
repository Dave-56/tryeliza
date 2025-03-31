# Eliza AI - Intelligent Email Management

Eliza AI is a modern email management solution that helps users efficiently handle their email communications through AI-powered features and smart automation.

## Features

- **Email Authentication & User Management**
  - Secure email/password authentication
  - Email verification flow with confirmation links
  - Password reset functionality
  - Custom user profiles with timezone and feature preferences

- **Smart Email Processing**
  - Thread summarization with intelligent deduplication
  - Auto-followup generation
  - Real-time email monitoring and updates
  - Contextual drafting capabilities
  - Action item conversion

## Tech Stack

- **Frontend**
  - React
  - TypeScript
  - React Query for data fetching
  - React Hook Form with Zod validation

- **Backend**
  - Node.js/TypeScript
  - Supabase for authentication and data storage

## Project Structure

- `/Client` - Frontend React application
- `/Backend` - Node.js/TypeScript backend services
  - Email processing services
  - Agent services
  - Task management
  - Email categorization

## Development

### Prerequisites
- Node.js
- npm/yarn
- Supabase account

### Environment Setup
Development URLs:
- Frontend: `http://localhost:3001`
- Backend: (Add your local backend URL)

Production URLs:
- Frontend: `https://app.tryeliza.ai`
- Backend: (Add your production backend URL)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Create a `.env` file in the root directory
   - Add required environment variables (see `.env.example`)

4. Start the development servers:
   ```bash
   # Start backend
   cd Backend
   npm run dev

   # Start frontend (in a new terminal)
   cd Client
   npm run dev
   ```

## Environment Setup and Authentication Flow

### Environment Setup

- Create a `.env` file in the root directory
- Add required environment variables (see `.env.example`)

### Authentication Flow

1. Users sign up with email/password
2. Verification email sent with confirmation link
3. User confirms email through verification link
4. Profile created with default settings
5. Welcome message displayed upon successful verification

## Contributing

(Add contribution guidelines here)

## License

(Add license information here)