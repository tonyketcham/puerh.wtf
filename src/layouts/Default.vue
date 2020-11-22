<template>
  <main
    class="min-h-screen bg-green-50 text-gray-700 dark:bg-gray-900 dark:text-purple-50"
  >
    <Header></Header>
    <slot />
  </main>
</template>

<script>
import { mapGetters } from "vuex";
import Header from "../components/Header.vue";

export default {
  components: {
    Header,
  },
  beforeMount() {
    this.$store.dispatch("initTheme");
  },
  computed: {
    ...mapGetters({ theme: "getTheme" }),
  },
  watch: {
    theme(newTheme, oldTheme) {
      newTheme === "light"
        ? document.querySelector("html").classList.remove("dark")
        : document.querySelector("html").classList.add("dark");
    },
  },
};
</script>

<style>
</style>
