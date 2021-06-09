<template>
  <div class="grid h-screen grid-flow-row grid-cols-12 grid-rows-12">
    <Header class="fixed top-0 z-10 col-span-12 row-span-1 row-start-1" />
    <div
      class="flex flex-row col-start-1 row-start-2 p-6 overflow-auto  col-span-full row-span-full"
    >
      <Sidebar-Nav class="sticky top-0 hidden w-60 lg:block" />
      <main class="flex-1">
        <div class="pb-6">
          <slot />
        </div>
      </main>
    </div>
    <div class="absolute bottom-0 left-0 right-0 w-full">
      <Footer v-if="false" />
    </div>
  </div>
</template>

<static-query>
  query {
    metadata {
      siteName
    }
  }
</static-query>

<script>
  import SidebarNav from '@/components/Sidebar-Nav.vue';
  import Footer from '@/components/footer/Footer.vue';

  export default {
    components: {
      Header: () => import('@/components/header/Header.vue'),
      SidebarNav,
      Footer,
    },
  };
</script>

<style lang="css">
  html,
  body {
    @apply text-primary-dark bg-primary-light dark:text-primary-light dark:bg-primary-dark transition-all duration-200 ease-in-out;
  }
</style>
