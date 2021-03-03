<template>
  <aside class="z-30 text-white bg-black">
    <header
      class="relative flex justify-between w-full h-16 p-4 m-4 transition duration-200 ease-in-out bg-purple-800 group"
    >
      <g-link class="w-full h-full" to="/">
        <h1
          class="w-auto font-sans text-2xl subpixel-antialiased font-medium tracking-tight text-transparent text-yellow-300 transition duration-200 ease-in-out bg-clip-text bg-gradient-to-r from-purple-400 to-yellow-300"
        >
          puerh.wtf
        </h1>
      </g-link>
      <ThemeToggle class="" />
    </header>
  </aside>
</template>

<static-query>
query {
  metadata {
    siteName
  }
}
</static-query>

<script>
  export default {
    name: 'Sidebar',
    components: {
      ThemeToggle: () => import('@/components/header/modules/Theme-Toggle.vue'),
      //   NavHead: () => import('@/components/header/modules/Nav-Head.vue'),
    },
  };
</script>
