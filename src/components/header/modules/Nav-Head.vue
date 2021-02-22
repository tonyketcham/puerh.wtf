<template>
  <div class="justify-center hidden space-x-6 md:flex">
    <g-link
      v-for="link in links"
      :key="link.title"
      :to="link.to"
      class="text-gray-500 dark:text-gray-400 transition-all duration-500 ease-out hover:(text-gray-600 dark:text-gray-300)"
    >
      {{ link.title }}
    </g-link>
  </div>
</template>

<script>
  export default {
    data() {
      return {
        links: [
          { title: 'Sessions', to: '/sessions/' },
          { title: 'Categories', to: '/categories/' },
          { title: 'Vendors', to: '/vendors/' },
          { title: 'About', to: '/about/' },
        ],
      };
    },
  };
</script>
