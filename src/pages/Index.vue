<template>
  <Layout>
    <div class="flex flex-row flex-wrap w-full gap-8">
      <div
        v-for="edge in $page.sessions.edges"
        :key="edge.node.id"
        class="box-border flex justify-between w-2/3 overflow-hidden border-2 border-gray-900 rounded-lg bg-gray-50 dark:bg-gray-700 h-72"
      >
        <div class="w-1/2 m-4">
          <h2 class="text-3xl">
            <g-link :to="edge.node.path">
              {{ edge.node.title }}
            </g-link>
          </h2>
          <p>
            {{ edge.node.excerpt }}
          </p>
        </div>
        <div class="w-1/3"></div>
      </div>
    </div>
  </Layout>
</template>

<page-query>
query {
  sessions: allTasting {
  	edges {
      node {
        title
        path
        id
        excerpt
        images {
          image
          alt
        }
      }
    }
  }
}
</page-query>

<script>
export default {
  metaInfo: {
    title: 'Pu-erh, wtf?',
  },
  computed: {
    name() {
      return;
    },
  },
};
</script>
