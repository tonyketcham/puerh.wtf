<template>
  <div
    class="flex w-full h-full gap-8 p-6 overflow-y-scroll bg-gray-200 dark:bg-gray-800 lg:p-12"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-col flex-wrap flex-1 space-y-2">
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
        v-for="edge in $page.sessions.edges"
        :key="edge.node.id"
        :info="edge.node"
      />
    </div>
  </div>
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
  import SidebarNav from '@/components/Sidebar-Nav.vue';
  import SessionCard from '@/components/Session-Card.vue';

  export default {
    components: { SidebarNav, SessionCard },
    metaInfo: {
      title: 'A tea log',
    },
  };
</script>
<style lang="scss" scoped>
  .tabs {
    a {
      @apply p-2 rounded-md transition-all;
    }
    a:hover {
      @apply dark:bg-gray-700 bg-gray-300 text-gray-600 dark:text-gray-300;
    }
  }
</style>
