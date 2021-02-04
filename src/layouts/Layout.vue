<template>
  <main
    class="h-screen overflow-hidden text-gray-700 transition-all duration-200 ease-in-out dark:text-gray-50"
  >
    <Header />
    <div class="h-full pt-14">
      <slot />
    </div>
  </main>
</template>

<static-query>
query {
  metadata {
    siteName
  }
}
</static-query>

<script>
  import Header from '../components/header/Header.vue';

  export default {
    components: {
      Header,
    },
  };
</script>

<style lang="css">
  html,
  body {
    @apply bg-gray-200 dark:bg-gray-800 overscroll-none;
  }
</style>
