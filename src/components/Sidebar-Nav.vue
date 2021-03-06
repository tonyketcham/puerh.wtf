<template>
  <nav
    class="flex flex-col p-4 space-y-2.5 text-lg dark:bg-gray-800 border-r-2 dark:border-gray-700 border-gray-200 shadow-md bg-gray-50 h-full transition-all duration-200 ease-in-out"
  >
    <h2
      class="py-0.5 max-w-max mt-4 text-xl border-b-2 border-yellow-400 text-gray-600 dark:text-gray-300 transition-all duration-200 ease-in-out"
    >
      Categories
    </h2>
    <g-link
      v-for="edge in $static.categories.edges"
      :key="edge.node.title"
      :to="edge.node.path"
      class="z-10 block px-2 space-x-1.5 text-base text-gray-700 transition-all duration-200 ease-out rounded dark:text-gray-200 group hover:bg-indigo-200"
    >
      <dt
        class="inline-block w-4 h-1 align-middle transform -rotate-45 rounded shadow-md"
        :style="`background-color: ${edge.node.color}`"
      />
      <dd class="inline group-hover:text-gray-900">{{ edge.node.title }}</dd>
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

<style scoped>
  nav {
    height: calc(100vh - 3.5rem);
  }
</style>
