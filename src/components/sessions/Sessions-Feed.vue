<template>
  <simplebar class="h-full">
    <section class="flex-col flex-wrap p-6 space-y-7 lg:p-16">
      <header class="flex justify-between">
        <h1 class="text-2xl">Sessions</h1>
        <nav class="space-x-2 tabs">
          <g-link to="/sessions/top/">Top</g-link>
          <g-link to="/sessions/latest/">Latest</g-link>
          <g-link to="/sessions/month/">Month</g-link>
          <g-link to="/sessions/year/">Year</g-link>
        </nav>
      </header>
      <Session-Card
        v-for="edge in $static.sessions.edges"
        :key="edge.node.id"
        :info="edge.node"
      />
    </section>
  </simplebar>
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
        style {
          category {
            color
          }
        }
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
  import simplebar from 'simplebar-vue';
  import 'simplebar/dist/simplebar.min.css';
  export default {
    components: {
      SessionCard,
      simplebar,
    },
  };
</script>
