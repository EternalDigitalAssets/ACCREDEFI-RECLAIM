// NEW in Bot API 9.0 - You're missing these!
const { DeviceStorage, SecureStorage } = window.Telegram.WebApp;

// Device Storage - for user preferences, verification history
DeviceStorage.setItem('agenonymous_verification_count', '1');
DeviceStorage.setItem('user_preferred_language', 'en');

// Secure Storage - for sensitive verification tokens
SecureStorage.setItem('verification_credential_hash', 'abc123...');
