const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const pino = require('pino');
const fs = require('fs').promises;
const { logger, errorLogger } = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.qr = null;
    this.sessionPath = path.join(__dirname, '../sessions');
    this.connectionUpdateHandler = null;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECT_ATTEMPTS = 5;
  }

  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  async waitForQR(timeout = 60000) {
    return new Promise((resolve) => {
      let timeoutId = null;

      // Function to cleanup event handlers
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (this.connectionUpdateHandler) {
          this.sock.ev.off('connection.update', this.connectionUpdateHandler);
          this.connectionUpdateHandler = null;
        }
      };

      timeoutId = setTimeout(() => {
        cleanup();
        // Resolve with null on timeout
        resolve(null);
      }, timeout);

      this.connectionUpdateHandler = (update) => {
        const { connection, qr } = update;

        if (qr) {
          cleanup();
          this.qr = qr;
          resolve(qr);
        } else if (connection === 'open') {
          cleanup();
          resolve(null);
        }
      };

      this.sock.ev.on('connection.update', this.connectionUpdateHandler);
    });
  }

  async initialize(isReconnecting = false) {
    try {
      if (isReconnecting) {
        this.reconnectAttempts += 1;
        if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
          logger.warn(`Maximum reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) exceeded`);
          return await this.handleLogout('max_attempts_exceeded');
        }
        logger.info(`Attempting to reconnect... (Attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
      } else {
        this.resetReconnectAttempts();
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Baileys REST API', 'Chrome', '1.0.0'],
        logger: pino({ level: 'silent' }),
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          // If already connected and trying to reconnect, cancel the operation
          if (this.isConnected && isReconnecting) {
            logger.info('Connection already active, reconnection cancelled');
            return;
          }

          const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect && !this.isConnected) {
            await this.initialize(true);
          } else if (!shouldReconnect) {
            logger.info('Session terminated');
            await this.handleLogout('connection_closed');
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qr = null;
          this.resetReconnectAttempts();
          logger.info('WhatsApp connection successful!');
          await WhatsAppService.notifyWebhook('connection', { status: 'connected' });
        }
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
          await Promise.all(m.messages.map((msg) => WhatsAppService.sendToWebhook(msg)));
        }
      });

      // Wait for QR code or successful connection
      const qr = await this.waitForQR();

      // If QR code is received
      if (qr) {
        await WhatsAppService.notifyWebhook('connection', { status: 'waiting_qr', qr });
        return {
          success: true,
          status: 'waiting_qr',
          qr,
        };
      }

      // If connection is successful
      if (this.isConnected) {
        return {
          success: true,
          status: 'connected',
          message: 'WhatsApp connection successful',
        };
      }

      // In case of timeout or other issues
      return {
        success: false,
        status: 'error',
        message: 'Failed to get QR code or establish connection',
      };
    } catch (error) {
      errorLogger.error('Failed to initialize WhatsApp connection:', error);
      await WhatsAppService.notifyWebhook('error', { error: error.message });
      return {
        success: false,
        status: 'error',
        message: 'Failed to initialize WhatsApp connection',
        error: error.message,
      };
    }
  }

  async handleLogout(reason = 'normal_logout') {
    try {
      // Clean up session files
      await fs.rm(this.sessionPath, { recursive: true, force: true });

      // Reset state
      this.sock = null;
      this.isConnected = false;
      this.qr = null;

      // Notify webhook
      await WhatsAppService.notifyWebhook('connection', {
        status: 'logged_out',
        reason,
      });

      logger.info(`Session files cleaned and session terminated (${reason})`);

      return {
        success: true,
        status: 'logged_out',
        message: 'Session successfully terminated',
        reason,
      };
    } catch (error) {
      errorLogger.error('Error during session cleanup:', error);
      return {
        success: false,
        status: 'error',
        message: 'Error occurred while terminating session',
        error: error.message,
      };
    }
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout();
        return await this.handleLogout('user_logout');
      }
      return {
        success: false,
        status: 'error',
        message: 'No active session found',
      };
    } catch (error) {
      errorLogger.error('Error during logout:', error);
      return {
        success: false,
        status: 'error',
        message: 'Error occurred while logging out',
        error: error.message,
      };
    }
  }

  static async notifyWebhook(event, data) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          ...data,
        }),
      });

      if (!response.ok) {
        errorLogger.error('Failed to send webhook:', response.statusText);
      }
    } catch (error) {
      errorLogger.error('Error during webhook notification:', error);
    }
  }

  static async sendToWebhook(message) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'message',
          timestamp: new Date().toISOString(),
          data: message,
        }),
      });

      if (!response.ok) {
        errorLogger.error('Failed to send webhook:', response.statusText);
      }
    } catch (error) {
      errorLogger.error('Error during webhook notification:', error);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      qr: this.qr,
    };
  }

  async sendMessage(to, message) {
    if (!this.isConnected) {
      throw new Error('WhatsApp connection is not active');
    }

    try {
      const result = await this.sock.sendMessage(to, { text: message });
      logger.info('Message sent:', { to, messageId: result.key.id });
      return result;
    } catch (error) {
      errorLogger.error('Failed to send message:', error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService();
