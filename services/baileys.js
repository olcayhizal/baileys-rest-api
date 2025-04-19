const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const pino = require('pino');
const { logger, errorLogger } = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.isConnected = false;
    this.qr = null;
    this.sessionPath = path.join(__dirname, '../sessions');
  }

  async waitForQR(timeout = 60000) {
    return new Promise((resolve, reject) => {
      // Timeout kontrolü
      const timeoutId = setTimeout(() => {
        reject(new Error('QR kod alınamadı: Zaman aşımı'));
      }, timeout);

      // QR kod event listener'ı
      const qrListener = (update) => {
        const { qr } = update;
        if (qr) {
          clearTimeout(timeoutId);
          this.qr = qr;
          resolve(qr);
        }
      };

      // Bağlantı başarılı olursa
      const connectionListener = (update) => {
        const { connection } = update;
        if (connection === 'open') {
          clearTimeout(timeoutId);
          resolve(null); // Bağlantı başarılı, QR kodu gerekmedi
        }
      };

      // Event listener'ları ekle
      this.sock.ev.on('connection.update', (update) => {
        qrListener(update);
        connectionListener(update);
      });
    });
  }

  async initialize() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Baileys REST API', 'Chrome', '1.0.0'],
        logger: pino({ level: 'silent' }), // Baileys'in kendi loglarını sustur
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode
            !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            logger.info('Yeniden bağlanılıyor...');
            this.initialize();
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qr = null;
          logger.info('WhatsApp bağlantısı başarılı!');
        }
      });

      this.sock.ev.on('creds.update', saveCreds);

      // Mesaj alma eventi
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
          await Promise.all(m.messages.map((msg) => WhatsAppService.sendToWebhook(msg)));
        }
      });

      // QR kodu veya bağlantı başarılı olana kadar bekle
      const qr = await this.waitForQR();
      return qr;
    } catch (error) {
      errorLogger.error('WhatsApp bağlantısı başlatılamadı:', error);
      throw error;
    }
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout();
        this.sock = null;
        this.isConnected = false;
        this.qr = null;
        logger.info('WhatsApp oturumu sonlandırıldı');
      }
    } catch (error) {
      errorLogger.error('Logout sırasında hata:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      qr: this.qr,
    };
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
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        errorLogger.error('Webhook gönderimi başarısız:', response.statusText);
      }
    } catch (error) {
      errorLogger.error('Webhook gönderimi sırasında hata:', error);
    }
  }

  async sendMessage(to, message) {
    if (!this.isConnected) {
      throw new Error('WhatsApp bağlantısı aktif değil');
    }

    try {
      const result = await this.sock.sendMessage(to, { text: message });
      logger.info('Mesaj gönderildi:', { to, messageId: result.key.id });
      return result;
    } catch (error) {
      errorLogger.error('Mesaj gönderimi başarısız:', error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService();
