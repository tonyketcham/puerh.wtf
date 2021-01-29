<template>
  <header
    class="fixed flex w-full h-16 bg-gray-200 bg-opacity-75 dark:bg-gray-800 place-content-around"
  >
    <g-link to="/" class="my-auto">{{ $static.metadata.siteName }}</g-link>
    <g-link to="/about/" class="my-auto">About</g-link>
    <button @click="toggleTheme" class="my-auto">
      Theme Toggle
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
export default {
  methods: {
    toggleTheme() {
      this.$store.dispatch('toggleTheme');
    },
  },
};
</script>
