<template>
  <div class="flex w-full h-full gap-8">
    <aside class="hidden h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-auto">
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
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';
  import SidebarNav from '@/components/Sidebar-Nav.vue';

  export default {
    components: {
      SidebarNav,
      SessionsFeed,
    },
    metaInfo: {
      title: 'Tea',
    },
  };
</script>
