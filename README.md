# Baileys REST API

A Node.js application that enables WhatsApp messaging operations through a REST API using the [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) library.

## Features

- WhatsApp Web connection
- Session initialization with QR code
- Send and receive messages
- Session management

## Requirements

- Node.js (v18 or higher recommended)
- npm or yarn
- WhatsApp account

## Installation

1. Clone the project:
```bash
git clone https://github.com/muzafferkadir/baileys-rest-api.git
cd baileys-rest-api
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Start the application:
```bash
npm start
# or
yarn start
```

## Usage

### Starting a Session

```bash
curl -X POST http://localhost:3000/api/session/start
```

This command will return a QR code. You can start the session by scanning the QR code with your WhatsApp application.

### Sending a Message

```bash
curl -X POST http://localhost:3000/api/message/send-text \
  -H "Content-Type: application/json" \
  -d '{
    "to": "905xxxxxxxxx@s.whatsapp.net",
    "message": "Hello!"
  }'
```

### Sending Media

```bash
TODO
```

## API Endpoints

- `POST /api/session/start` - Start a new session
- `GET /api/session/status` - Check session status
- `POST /api/session/logout` - Logout from the session
- `POST /api/message/send-text` - Send text message
- `GET /api/message/check-number` - Check number is valid for WhatsApp

## Contributing

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Contact

Muzaffer Kadir YILMAZ - [@muzafferkadir](https://github.com/muzafferkadir)

Project Link: [https://github.com/muzafferkadir/baileys-rest-api](https://github.com/muzafferkadir/baileys-rest-api) 