<template>
  <header class="sticky px-1 py-4 m-2" style="width: calc(100% - 1rem)">
    <nav class="flex px-3 m-auto place-content-between">
      <div class="w-60">
        <Logo />
      </div>

      <div class="my-auto">
        <Nav-Head />
      </div>

      <div class="flex justify-end flex-1">
        <Theme-Toggle />
      </div>
    </nav>
  </header>
</template>

<script>
  import Logo from '../brand/Logo.vue';
  export default {
    components: {
      ThemeToggle: () => import('./modules/Theme-Toggle.vue'),
      NavHead: () => import('./modules/Nav-Head.vue'),
      Logo,
    },
  };
</script>
