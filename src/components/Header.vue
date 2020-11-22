<template>
  <header class="w-full bg-gray-800 flex place-content-around">
    <g-link to="/">{{ $static.metadata.siteName }}</g-link>

    <nav class="nav">
      <g-link class="nav__link" to="/">Home</g-link>
      <g-link class="nav__link" to="/about/">About</g-link>
    </nav>
    <button @click="toggleTheme" class="dark:text-red-400 text-cyan-200">
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
      this.$store.dispatch("toggleTheme");
    },
  },
};
</script>

<style>
</style>