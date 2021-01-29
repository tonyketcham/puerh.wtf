<template> </template>

<page-query>
query ($id: ID!) {
    tasting(id: $id){
        tea_name
    }
}
</page-query>

<script>
export default {};
</script>
