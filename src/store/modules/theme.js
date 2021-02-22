export default {
  state: {
    theme: {},
  },
  mutations: {
    SET_THEME(state, theme) {
      state.theme = theme;
      localStorage.theme = theme;
    },
  },
  actions: {
    initTheme({ commit, getters }) {
      const cachedTheme = localStorage.theme ? localStorage.theme : false;
      const userPrefersDark = window.matchMedia('(prefers-color-scheme: dark)')
        .matches;

      if (cachedTheme) commit('SET_THEME', cachedTheme);
      else if (userPrefersDark) commit('SET_THEME', 'dark');
      else commit('SET_THEME', 'light');

      applyDOMTheme(getters.getTheme);
    },
    toggleTheme({ commit }) {
      switch (localStorage.theme) {
        case 'light':
          commit('SET_THEME', 'dark');
          applyDOMTheme('dark');
          break;
        default:
          commit('SET_THEME', 'light');
          applyDOMTheme('light');
          break;
      }
    },
  },
  getters: {
    getTheme: (state) => {
      return state.theme;
    },
  },
};

function applyDOMTheme(newTheme) {
  if (newTheme === 'light') {
    document.querySelector('html').classList.remove('dark');
    document.querySelector('html').classList.add('light');
  } else {
    document.querySelector('html').classList.remove('light');
    document.querySelector('html').classList.add('dark');
  }
}
