<template>
  <div
    class="text-gray-700 transition-all duration-200 ease-in-out bg-gray-100 dark:text-gray-50 dark:bg-gray-900"
  >
    <Header class="z-30" />
    <main class="h-full pt-14">
      <slot />
    </main>
  </div>
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
    components: {
      Header: () => import('../components/header/Header.vue'),
    },
  };
</script>

<style lang="css">
  /* html,
  body {
    @apply bg-gray-200 dark:bg-gray-800 overscroll-none;
  } */
</style>
