// Prevent accidental Mini App closure during verification process
const { postEvent } = window.Telegram.WebApp;

// Make app "sticky" during critical verification steps
postEvent('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
