import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';

let bot: TelegramBot | null = null;
let currentBotToken: string | null = null;
let broadcastCallback: ((data: any) => void) | null = null;

// Track Telegram message ID to support session mappings
// Maps Telegram message_id to session token for reply tracking
const messageIdToSessionToken = new Map<number, string>();

export function setSupportChatBroadcastCallback(callback: (data: any) => void) {
  broadcastCallback = callback;
  console.log('✅ Telegram support chat broadcast callback registered');
}

// Clean up message mappings for a specific session token
export function cleanupSessionMessageMappings(sessionToken: string): void {
  let cleanedCount = 0;
  for (const [messageId, token] of Array.from(messageIdToSessionToken.entries())) {
    if (token === sessionToken) {
      messageIdToSessionToken.delete(messageId);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} message mapping(s) for session ${sessionToken.slice(0, 8)}...`);
  }
}

export async function initializeTelegramBot(forceReload: boolean = false): Promise<boolean> {
  try {
    // Check if Telegram bot polling is disabled via environment variable
    // This is useful when running multiple instances (e.g., on Digital Ocean)
    // Set DISABLE_TELEGRAM_POLLING=true on instances where you don't want the bot to poll
    if (process.env.DISABLE_TELEGRAM_POLLING === 'true') {
      console.log('⏸️  Telegram bot polling disabled via DISABLE_TELEGRAM_POLLING environment variable');
      return false;
    }

    const tokenSetting = await storage.getSystemSetting('telegram_bot_token');
    
    if (!tokenSetting || !tokenSetting.value) {
      console.log('Telegram bot token not configured');
      return false;
    }

    // Reinitialize if token has changed or force reload is requested
    if (forceReload || currentBotToken !== tokenSetting.value) {
      if (bot) {
        // Clean up old bot instance
        try {
          await bot.close();
        } catch (e) {
          // Ignore close errors
        }
        bot = null;
      }
      
      bot = new TelegramBot(tokenSetting.value, { polling: true });
      currentBotToken = tokenSetting.value;
      
      // Set up /start command handler for deep link authentication
      bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const token = match?.[1];
        
        if (!token) {
          await bot?.sendMessage(chatId, '❌ Invalid link. Please use the link from your account settings.');
          return;
        }
        
        try {
          // Find user by token
          const user = await storage.getUserByLinkToken(token);
          
          if (!user) {
            await bot?.sendMessage(chatId, '❌ Link expired or invalid. Please generate a new link from your account settings.');
            return;
          }
          
          // Check if another account is already using this Telegram ID
          const existingUser = await storage.getUserByTelegramId(msg.from!.id.toString());
          if (existingUser && existingUser.id !== user.id) {
            await bot?.sendMessage(chatId, '❌ This Telegram account is already linked to another account.');
            return;
          }
          
          // Link the Telegram account
          await storage.linkTelegramAccount(user.id, {
            id: msg.from!.id.toString(),
            username: msg.from?.username,
            first_name: msg.from?.first_name,
            photo_url: undefined
          });
          
          await bot?.sendMessage(
            chatId, 
            `✅ Success! Your Telegram account has been linked to your gaming account.\n\nYou can now close this chat and return to the app.`
          );
          
          console.log(`✅ Telegram account linked for user ${user.email}`);
        } catch (error) {
          console.error('Error linking Telegram account:', error);
          await bot?.sendMessage(chatId, '❌ An error occurred. Please try again later.');
        }
      });
      
      // Handle support chat replies and general messages
      bot.on('message', async (msg) => {
        // Skip bot's own messages (including forwarded notifications and warnings)
        if (msg.from?.is_bot) {
          return;
        }
        
        // Skip /start commands (handled by onText above)
        if (msg.text?.startsWith('/start')) {
          return;
        }
        
        // Check if this is a reply to a support chat message
        if (msg.reply_to_message && msg.text) {
          const replyToMessageId = msg.reply_to_message.message_id;
          const sessionToken = messageIdToSessionToken.get(replyToMessageId);
          
          if (sessionToken) {
            try {
              const session = await storage.getSupportChatSessionByToken(sessionToken);
              if (session && session.status !== 'closed') {
                // Create support message
                const message = await storage.createSupportChatMessage({
                  sessionId: session.id,
                  author: 'support',
                  authorTelegramId: msg.from?.id.toString() || null,
                  body: msg.text
                });
                
                // Broadcast to all connected WebSocket clients
                if (broadcastCallback) {
                  broadcastCallback({
                    type: 'support-chat:new-message',
                    sessionId: session.id,
                    message
                  });
                } else {
                  console.warn('⚠️ Broadcast callback not set - message not sent to WebSocket clients');
                }
                
                console.log(`✅ Support reply forwarded for session ${session.id} (user: ${session.userDisplayName})`);
              } else {
                await bot?.sendMessage(
                  msg.chat.id,
                  '⚠️ This chat session has been closed. The user will not receive this message.'
                );
              }
            } catch (error) {
              console.error('Error processing support chat reply:', error);
              await bot?.sendMessage(
                msg.chat.id,
                '❌ Error processing your reply. Please try again or contact support.'
              );
            }
          } else {
            // Message ID not found in our mapping
            console.log(`⚠️ Reply to unknown message (msg_id: ${replyToMessageId})`);
          }
        } else if (msg.text && msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
          // Message in support group but not a reply
          await bot?.sendMessage(
            msg.chat.id,
            '⚠️ Please reply to a customer message so we know which chat to route this to.',
            { reply_to_message_id: msg.message_id }
          );
        }
      });
      
      console.log('✅ Telegram bot initialized successfully with deep link support');
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error);
    currentBotToken = null;
    bot = null;
    return false;
  }
}

export async function sendWithdrawalNotification(
  userName: string,
  amount: string,
  paymentMethod: string,
  time: string
): Promise<boolean> {
  try {
    const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
    
    if (!chatIdSetting || !chatIdSetting.value) {
      console.log('Telegram chat ID not configured');
      return false;
    }

    // Always check if we need to reinitialize (in case token was updated)
    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const message = `
🔔 NEW WITHDRAWAL REQUEST

👤 User: ${userName}
💰 Amount: $${amount}
💳 Payment: ${paymentMethod}
⏰ Time: ${time}

👉 Check admin panel now
    `.trim();

    await bot.sendMessage(chatIdSetting.value, message);
    console.log('✅ Telegram notification sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    
    // If authorization error, force reload and retry once
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
        if (!chatIdSetting || !chatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const message = `
🔔 NEW WITHDRAWAL REQUEST

👤 User: ${userName}
💰 Amount: $${amount}
💳 Payment: ${paymentMethod}
⏰ Time: ${time}

👉 Check admin panel now
          `.trim();
          await bot.sendMessage(chatIdSetting.value, message);
          console.log('✅ Telegram notification sent successfully after token reload');
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send notification after token reload:', retryError);
      }
    }
    
    return false;
  }
}

export async function testTelegramConnection(): Promise<boolean> {
  try {
    const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
    
    if (!chatIdSetting || !chatIdSetting.value) {
      console.log('Telegram chat ID not configured');
      return false;
    }

    // Always reload token for test (to ensure we're using latest settings)
    const initialized = await initializeTelegramBot(true);
    if (!initialized || !bot) {
      return false;
    }

    const message = '✅ Test notification successful! Your Telegram bot is working correctly.';
    await bot.sendMessage(chatIdSetting.value, message);
    return true;
  } catch (error) {
    console.error('Failed to send test notification:', error);
    
    // Clear cached token on error so next attempt will retry
    currentBotToken = null;
    bot = null;
    
    return false;
  }
}

export async function getChatId(botToken: string): Promise<string | null> {
  try {
    const tempBot = new TelegramBot(botToken, { polling: false });
    const updates = await tempBot.getUpdates({ limit: 1, offset: -1 });
    
    if (updates.length > 0 && updates[0].message?.chat?.id) {
      return updates[0].message.chat.id.toString();
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get chat ID:', error);
    return null;
  }
}

export async function sendGameSignal(
  gameId: string,
  duration: number = 3,
  photoUrl?: string
): Promise<boolean> {
  try {
    const signalEnabledSetting = await storage.getSystemSetting('telegram_signals_enabled');
    
    if (!signalEnabledSetting || signalEnabledSetting.value !== 'true') {
      console.log('Telegram signals are disabled');
      return false;
    }

    const signalChatIdSetting = await storage.getSystemSetting('telegram_signal_chat_id');
    
    if (!signalChatIdSetting || !signalChatIdSetting.value) {
      console.log('Telegram signal chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const colors = ['🟢', '🔴', '🟣'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const message = `WinGo ${duration} min\n🎉  ${gameId}    Join   ${randomColor}`;

    // Send photo with caption if photoUrl is provided
    if (photoUrl) {
      await bot.sendPhoto(signalChatIdSetting.value, photoUrl, { 
        caption: message 
      });
      console.log('✅ Telegram signal with photo sent successfully:', message);
    } else {
      await bot.sendMessage(signalChatIdSetting.value, message);
      console.log('✅ Telegram signal sent successfully:', message);
    }
    return true;
  } catch (error) {
    console.error('Failed to send Telegram signal:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const signalChatIdSetting = await storage.getSystemSetting('telegram_signal_chat_id');
        if (!signalChatIdSetting || !signalChatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const colors = ['🟢', '🔴', '🟣'];
          const randomColor = colors[Math.floor(Math.random() * colors.length)];
          const message = `WinGo ${duration} min\n🎉  ${gameId}    Join   ${randomColor}`;
          
          if (photoUrl) {
            await bot.sendPhoto(signalChatIdSetting.value, photoUrl, { 
              caption: message 
            });
            console.log('✅ Telegram signal with photo sent successfully after token reload');
          } else {
            await bot.sendMessage(signalChatIdSetting.value, message);
            console.log('✅ Telegram signal sent successfully after token reload');
          }
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send signal after token reload:', retryError);
      }
    }
    
    return false;
  }
}

export async function sendPhotoToSignalChannel(
  photoUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    const signalEnabledSetting = await storage.getSystemSetting('telegram_signals_enabled');
    
    if (!signalEnabledSetting || signalEnabledSetting.value !== 'true') {
      console.log('Telegram signals are disabled');
      return false;
    }

    const signalChatIdSetting = await storage.getSystemSetting('telegram_signal_chat_id');
    
    if (!signalChatIdSetting || !signalChatIdSetting.value) {
      console.log('Telegram signal chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    await bot.sendPhoto(signalChatIdSetting.value, photoUrl, { 
      caption: caption || '' 
    });
    console.log('✅ Photo sent to Telegram signal channel successfully');
    return true;
  } catch (error) {
    console.error('Failed to send photo to Telegram signal channel:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const signalChatIdSetting = await storage.getSystemSetting('telegram_signal_chat_id');
        if (!signalChatIdSetting || !signalChatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          await bot.sendPhoto(signalChatIdSetting.value, photoUrl, { 
            caption: caption || '' 
          });
          console.log('✅ Photo sent to Telegram signal channel after token reload');
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send photo after token reload:', retryError);
      }
    }
    
    return false;
  }
}

export async function sendAdminLoginNotification(
  adminEmail: string,
  ipAddress: string,
  timestamp: string
): Promise<boolean> {
  try {
    const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
    
    if (!chatIdSetting || !chatIdSetting.value) {
      console.log('Telegram chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const message = `
🔐 ADMIN LOGIN DETECTED

👤 User: ${adminEmail}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔔 An admin has logged into the dashboard.
    `.trim();

    await bot.sendMessage(chatIdSetting.value, message);
    console.log('✅ Admin login notification sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send admin login notification:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
        if (!chatIdSetting || !chatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const message = `
🔐 ADMIN LOGIN DETECTED

👤 User: ${adminEmail}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔔 An admin has logged into the dashboard.
          `.trim();
          await bot.sendMessage(chatIdSetting.value, message);
          console.log('✅ Admin login notification sent successfully after token reload');
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send notification after token reload:', retryError);
      }
    }
    
    return false;
  }
}

export async function sendFailedLoginNotification(
  email: string,
  ipAddress: string,
  timestamp: string
): Promise<boolean> {
  try {
    const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
    
    if (!chatIdSetting || !chatIdSetting.value) {
      console.log('Telegram chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const message = `
⚠️ FAILED LOGIN ATTEMPT

👤 Email: ${email}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔒 Invalid credentials provided.
    `.trim();

    await bot.sendMessage(chatIdSetting.value, message);
    console.log('✅ Failed login notification sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send failed login notification:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
        if (!chatIdSetting || !chatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const message = `
⚠️ FAILED LOGIN ATTEMPT

👤 Email: ${email}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔒 Invalid credentials provided.
          `.trim();
          await bot.sendMessage(chatIdSetting.value, message);
          console.log('✅ Failed login notification sent successfully after token reload');
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send notification after token reload:', retryError);
      }
    }
    
    return false;
  }
}

export async function sendInvalid2FANotification(
  email: string,
  ipAddress: string,
  timestamp: string
): Promise<boolean> {
  try {
    const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
    
    if (!chatIdSetting || !chatIdSetting.value) {
      console.log('Telegram chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const message = `
⚠️ INVALID 2FA CODE ATTEMPT

👤 User: ${email}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔒 Someone entered a wrong 2FA code.
    `.trim();

    await bot.sendMessage(chatIdSetting.value, message);
    console.log('✅ Invalid 2FA notification sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send invalid 2FA notification:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const chatIdSetting = await storage.getSystemSetting('telegram_chat_id');
        if (!chatIdSetting || !chatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const message = `
⚠️ INVALID 2FA CODE ATTEMPT

👤 User: ${email}
🌐 IP Address: ${ipAddress}
⏰ Time: ${timestamp}

🔒 Someone entered a wrong 2FA code.
          `.trim();
          await bot.sendMessage(chatIdSetting.value, message);
          console.log('✅ Invalid 2FA notification sent successfully after token reload');
          return true;
        }
      } catch (retryError) {
        console.error('Failed to send notification after token reload:', retryError);
      }
    }
    
    return false;
  }
}

// Forward user support chat message to Telegram
export async function forwardSupportChatMessage(
  sessionToken: string,
  userDisplayName: string,
  messageBody: string
): Promise<boolean> {
  try {
    const telegramIntegrationSetting = await storage.getSystemSetting('telegram_integration_enabled');
    
    if (telegramIntegrationSetting?.value === 'false') {
      console.log('📴 Telegram integration is disabled - message not forwarded to Telegram');
      return true;
    }

    const supportChatIdSetting = await storage.getSystemSetting('telegram_support_chat_id');
    
    if (!supportChatIdSetting || !supportChatIdSetting.value) {
      console.log('Telegram support chat ID not configured');
      return false;
    }

    const initialized = await initializeTelegramBot();
    if (!initialized || !bot) {
      return false;
    }

    const message = `
💬 NEW SUPPORT MESSAGE

👤 From: ${userDisplayName}
📝 Message: ${messageBody}

Reply to this message to respond to the user.
    `.trim();

    // Send message and capture the message_id for reply tracking
    const sentMessage = await bot.sendMessage(supportChatIdSetting.value, message);
    
    // Store the mapping between Telegram message ID and session token for replies
    messageIdToSessionToken.set(sentMessage.message_id, sessionToken);
    
    console.log(`✅ Support chat message forwarded to Telegram (msg_id: ${sentMessage.message_id}, session: ${sessionToken.slice(0, 8)}...)`);
    return true;
  } catch (error) {
    console.error('Failed to forward support chat message:', error);
    
    if (error instanceof Error && error.message.includes('401')) {
      console.log('⚠️ Authorization error, attempting to reload bot token...');
      try {
        const supportChatIdSetting = await storage.getSystemSetting('telegram_support_chat_id');
        if (!supportChatIdSetting || !supportChatIdSetting.value) {
          return false;
        }
        
        const reinitialized = await initializeTelegramBot(true);
        if (reinitialized && bot) {
          const message = `
💬 NEW SUPPORT MESSAGE

👤 From: ${userDisplayName}
📝 Message: ${messageBody}

Reply to this message to respond to the user.
          `.trim();
          const sentMessage = await bot.sendMessage(supportChatIdSetting.value, message);
          messageIdToSessionToken.set(sentMessage.message_id, sessionToken);
          console.log(`✅ Support chat message forwarded after token reload (msg_id: ${sentMessage.message_id})`);
          return true;
        }
      } catch (retryError) {
        console.error('Failed to forward message after token reload:', retryError);
      }
    }
    
    return false;
  }
}
