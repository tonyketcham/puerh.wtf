<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-1">
      <Sessions-Feed :sessions="$page.sessions" />
    </div>
  </div>
</template>

<page-query>
query {
  sessions: allTasting {
  	edges {
      node {
        title
        date (format: "MMM DD, YYYY")
        path
        id
        excerpt
        style {
          category {
            color
          }
        }
        tags {
    			title
          path
          color
        }
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
    components: {
      SidebarNav: () => import('@/components/Sidebar-Nav.vue'),
      SessionsFeed: () => import('@/components/sessions/Sessions-Feed.vue'),
    },
    metaInfo: {
      title: 'A tea log',
    },
  };
</script>
