// ============================================================
// App Controller - Screen management & initialization
// ============================================================

const App = {
  currentScreen: 'auth',

  /**
   * Initialize the app - called on page load
   */
  init() {
    // Initialize all UI modules
    AuthUI.init();
    LobbyUI.init();
    GameUI.init();

    console.log('🃏 304 Card Game initialized');
  },

  /**
   * Switch between screens (auth, lobby, game)
   */
  showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    // Show target screen
    const screen = document.getElementById(`screen-${screenName}`);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenName;
    }
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

window.App = App;
