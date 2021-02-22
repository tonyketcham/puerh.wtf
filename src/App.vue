<template>
  <Layout>
    <transition name="fade" appear>
      <router-view />
    </transition>
  </Layout>
</template>

<static-query>
query {
  metadata {
    siteName
    siteDescription
  }
}
</static-query>

<script>
  export default {
    metaInfo() {
      return {
        title: this.$static.metadata.siteName,
        meta: [
          {
            key: 'description',
            name: 'description',
            content: this.$static.metadata.siteDescription,
          },
        ],
      };
    },
    components: {
      Layout: () => import('~/layouts/Layout.vue'),
    },
    mounted() {
      this.$store.dispatch('initTheme');
    },
  };
</script>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  /* ::-webkit-scrollbar {
    @apply hidden;
  } */
  .fade-enter-active {
    transition: opacity 0.5s;
  }

  .fade-enter {
    opacity: 0;
  }
</style>
