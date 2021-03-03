<template>
  <main
    class="flex flex-row h-screen overflow-hidden text-gray-700 transition-all duration-200 ease-in-out dark:text-gray-50"
  >
    <Sidebar class="w-60" />
    <div class="flex-1 h-full">
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
  import Sidebar from '../components/sidebar/Sidebar.vue';
  export default {
    components: {
      Sidebar,
    },
  };
</script>

<style lang="css">
  html,
  body {
    @apply bg-gray-200 dark:bg-gray-800 overscroll-none;
  }
</style>
