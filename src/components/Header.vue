<template>
  <header
    class="w-full bg-gray-100 dark:bg-gray-800 flex place-content-between p-3"
  >
    <g-link to="/">{{ $static.metadata.siteName }}</g-link>

    <nav class="space-x-3">
      <g-link class="" to="/">Home</g-link>
      <g-link class="" to="/about/">About</g-link>
      <g-link
        class=""
        to="/session/2021/01/d02bce3b-0d12-4e02-b1f8-e9be46134228"
        >Test Sesh</g-link
      >
    </nav>

    <button
      @click="toggleTheme"
      class="focus:outline-none text-gray-700 dark:text-gray-100"
    >
      <svg
        v-if="theme === 'dark'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-6 h-6 hover:stroke-width"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-6 h-6"
      >
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    </button>
  </header>
</template>

<static-query>
query {
  metadata {
    siteName
  }
}
</static-query>

<script>
import { mapGetters } from 'vuex';
export default {
  computed: {
    ...mapGetters({ theme: 'getTheme' }),
  },
  methods: {
    toggleTheme() {
      this.$store.dispatch('toggleTheme');
    },
  },
};
</script>
