<template>
  <nav class="p-16 pr-0 space-y-2.5 text-lg">
    <g-link
      v-for="edge in $static.categories.edges"
      :key="edge.node.title"
      :to="edge.node.path"
      class="link"
      ><span>{{ randomEmoji() }}</span
      >{{ edge.node.title }}</g-link
    >
  </nav>
</template>

<static-query>
query Categories {
  categories: allCategory {
  	edges {
      node {
        title
        path
      }
    }
  }
}
</static-query>

<script>
  const emojis = require('emojis-list');
  export default {
    methods: {
      randomEmoji() {
        return emojis[Math.floor(Math.random() * (emojis.length - 2)) + 320];
      },
    },
  };
</script>

<style scoped>
  span {
    @apply mr-2 text-2xl;
  }
  .link {
    @apply block;
  }
  .link:hover {
    @apply bg-indigo-200 text-gray-900;
  }
</style>
