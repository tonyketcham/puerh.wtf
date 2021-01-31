<template>
  <section class="flex-col flex-wrap space-y-2">
    <header class="flex justify-between">
      <h1 class="text-2xl">Sessions</h1>
      <nav class="space-x-2 tabs">
        <g-link>Top</g-link>
        <g-link>Latest</g-link>
        <g-link>Month</g-link>
        <g-link>Year</g-link>
      </nav>
    </header>
    <Session-Card
      v-for="edge in $static.sessions.edges"
      :key="edge.node.id"
      :info="edge.node"
    />
  </section>
</template>
<static-query>
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
</static-query>
<script>
  import SessionCard from './Session-Card.vue';
  export default {
    components: {
      SessionCard,
    },
  };
</script>
