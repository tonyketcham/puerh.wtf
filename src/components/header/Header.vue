<template>
  <header
    class="fixed w-full p-4 transition-colors duration-150 ease-in-out bg-gray-200 border-b border-gray-300 shadow h-14 bg-opacity-40 border-opacity-20 dark:bg-gray-800 dark:border-gray-700"
    style="backdrop-filter: blur(4px)"
  >
    <nav class="flex w-full m-auto md:px-6 place-content-between">
      <div class="1/2 md:w-2/6">
        <g-link
          to="/"
          class="font-mono text-xl font-medium tracking-tight transition duration-200 ease-in-out transform scale-95 hover:text-yellow-800 dark:hover:text-yellow-300 -rotate-1 hover:scale-100"
          >🌱 {{ $static.metadata.siteName }} 🍵</g-link
        >
      </div>

      <div class="flex-1">
        <Nav-Head />
      </div>

      <div class="flex justify-end w-2/6">
        <Theme-Toggle />
      </div>
    </nav>
  </header>
</template>

<static-query>
query {
  metadata {
    siteName
  }
}
</static-query>

<script>
  import NavHead from './modules/Nav-Head.vue';
  import ThemeToggle from './modules/Theme-Toggle.vue';
  export default {
    components: { ThemeToggle, NavHead },
  };
</script>
