<template>
  <div class="justify-center hidden space-x-6 md:flex">
    <g-link v-for="link in links" :key="link.title" :to="link.to" class="link">
      {{ link.title }}
    </g-link>
  </div>
</template>

<script>
  export default {
    data() {
      return {
        links: [
          { title: 'Top Sessions', to: '/sessions/top/' },
          { title: 'Latest Sessions', to: '/sessions/latest/' },
          // { title: 'Sessions', to: '/sessions/' },
          // { title: 'Categories', to: '/categories/' },
          // { title: 'Vendors', to: '/vendors/' },
          // { title: 'About', to: '/about/' },
        ],
      };
    },
  };
</script>

<style scoped>
  .link {
    @apply text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 rounded dark:text-gray-400 transition-all duration-500 ease-out;
  }
  .link:hover {
    @apply text-gray-600 dark:text-gray-300;
  }
  .active {
    @apply dark:text-white text-black;
  }
</style>
