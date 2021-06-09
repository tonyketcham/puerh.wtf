<template>
  <nav class="flex flex-col space-y-3 text-lg">
    <h2
      class="py-0.5 max-w-max text-xl border-b-2 border-yellow-200"
      style="font-variation-settings: 'wght' 420"
    >
      Categories
    </h2>
    <g-link
      v-for="edge in $static.categories.edges"
      :key="edge.node.title"
      :to="edge.node.path"
      class="z-10 block space-x-2 text-base  group text-color-puerh uniform-transition"
      style="font-variation-settings: 'wght' 500, 'LXND' 1"
    >
      <dt class="inline-block">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="w-4 h-4 fill-current"
          :style="`color: ${edge.node.color}`"
        >
          <path fill="none" d="M0 0H24V24H0z" />
          <path
            d="M21 3v2c0 9.627-5.373 14-12 14H7.098c.212-3.012 1.15-4.835 3.598-7.001 1.204-1.065 1.102-1.68.509-1.327-4.084 2.43-6.112 5.714-6.202 10.958L5 22H3c0-1.363.116-2.6.346-3.732C3.116 16.974 3 15.218 3 13 3 7.477 7.477 3 13 3c2 0 4 1 8 0z"
          />
        </svg>
      </dt>
      <dd class="inline group-hover:text-gray-900 dark:group-hover:text-white">
        {{ edge.node.title }}
      </dd>
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
