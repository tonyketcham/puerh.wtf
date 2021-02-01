<template>
  <nav class="p-16 pr-0 space-y-2.5 text-lg">
    <g-link
      v-for="edge in $static.categories.edges"
      :key="edge.node.title"
      :to="edge.node.path"
      class="relative z-10 space-x-2 link"
    >
      <dt
        class="inline-block w-3 h-3 rounded"
        :style="`background-color: ${edge.node.color}`"
      />
      <dd class="inline">{{ edge.node.title }}</dd>
    </g-link>
  </nav>
</template>

<static-query>
query Categories {
  categories: allCategory {
  	edges {
      node {
        title
        path
        color
      }
    }
  }
}
</static-query>

<script></script>

<style scoped>
  .link {
    @apply block rounded px-2 transition-all ease-out duration-200;
  }
  .link:hover {
    @apply bg-indigo-200 text-gray-900 font-medium;
  }
</style>
