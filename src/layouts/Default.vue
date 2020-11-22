<template>
  <main
    class="min-h-screen bg-green-50 text-gray-700 dark:bg-gray-900 dark:text-purple-50"
  >
    <Header></Header>
    <slot />
  </main>
</template>

<script>
import Header from "../components/Header.vue";
import granularDarkMode from "../dark-mode";

export default {
  components: {
    Header,
  },
  beforeMount() {
    granularDarkMode();
  },
};
</script>

<style>
</style>
