<template>
  <main
    class="min-h-screen text-gray-700 transition-colors duration-150 ease-in-out bg-gray-200 dark:bg-gray-800 dark:text-gray-50"
  >
    <Header />
    <div class="p-16 pt-24">
      <slot />
    </div>
  </main>
</template>

<script>
  import Header from '../components/Header.vue';

  export default {
    components: {
      Header,
    },
  };
</script>
