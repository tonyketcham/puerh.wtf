<template>
  <Layout>
    <div class="flex flex-row flex-wrap w-full gap-8 p-16 ">
      <div
        v-for="edge in $page.sessions.edges"
        :key="edge.node.id"
        class="box-border flex justify-between w-1/2 overflow-hidden border-2 border-gray-900 rounded-lg h-72"
      >
        <div class="m-4">
          <h2 class="text-3xl">
            {{ edge.node.tea_name }}
          </h2>
          <p>
            {{ edge.node.excerpt }}
          </p>
        </div>
        <div class="w-1/2">
          <g-image
            v-if="edge.node.images[0]"
            :src="edge.node.images[0].image"
            :alt="edge.node.images[0].alt"
            blur="40"
            class="object-cover w-full h-full"
          />
        </div>
      </div>
    </div>
  </Layout>
</template>

<page-query>
query {
  sessions: allTasting {
  	edges {
      node {
        tea_name
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
};
</script>
