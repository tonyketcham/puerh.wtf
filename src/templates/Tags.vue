<template>
  <div class="w-full h-full p-6 overflow-y-scroll">
    <h1 class="text-6xl">{{ $page.tags.title }}</h1>
  </div>
</template>

<page-query>
query Tags ($id: ID!) {
  tags(id: $id) {
        id
        title
        color
    }
}
</page-query>

<script>
  export default {};
</script>
