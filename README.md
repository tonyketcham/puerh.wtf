[![Netlify Status](https://api.netlify.com/api/v1/badges/79932a8f-4ecb-4b1e-a4ed-d75e72bdfb7a/deploy-status)](https://app.netlify.com/sites/puerhwtf/deploys) ![CodeQL](https://github.com/tonyketcham/puerh.wtf/workflows/CodeQL/badge.svg?branch=main)

# 🌱 Pu-erh, wtf? 🍵

So I decided to develop a site just so I could document all the damn teas I drink. How did it come to this? Where did I go wrong? Why am I spending hundreds of dollars on tea? Well hey I'll meet ya in the cart on [white2tea](https://white2tea.com),,,,, hope that thing has digital wheels cuz I wanna kickflip that bitch with a `transform: rotateX(6rad);` and watch all the samples n cakes go flyin

## Features

- [Gridsome](https://gridsome.org/) for SSG
- [Tailwind 2.0](https://tailwindcss.com/) for UI (frontend dev in progress)
- [NetlifyCMS](https://www.netlifycms.org/) for saying tea words, headlessly
- mmm.. [JAMstack](https://jamstack.org/) for: I spent all my money on tea now I can't afford hosting

## Status & Roadmap

Right now we're in what you could consider the alpha state. The CMS is put together and experience tested well (a few updates still to come). 
The frontend of the site is usable but definitely a stand-in for what's to come. I've been designing a prototype in Adobe XD that's a complete departure from what's currently live, and I'm excited to finish that up and get to coding on it.

After that, I'm going to add in data visualization components, vendor/author pages, and more tea info that exists in the backend but not yet on the front. 

I think this project has some neat potential to show the trends of what I like and what terroirs I tend to gravitate towards. I'm also curious about working with some interactive map ideas down the line. Here, I could place context to terroir, displaying geo-tagged teas along with an average tasting chart for single origin teas of similar vintages.

To keep up with the status, check in to the issues pannel and the projects tab!

## Wanna collab?

### 1. Install Gridsome CLI tool if you don't have

`npm install --global @gridsome/cli`

### 2. Turn the lights on

1. clone 'er down
2. `cd puerh.wtf` to open the folder
3. `yarn install` because these node modules don't grow on trees
4. `gridsome develop` to start a local dev server at `http://localhost:8080`
5. Put stuff with your little hands

Is eslint telling you to fix a bunch of shit on the end of every line?
[Then look no further!](https://developpaper.com/solution-to-delete-%E2%90%8Deslint-prettier-prettier-error/)

### 3. Test local build

This is important to debug and troubleshoot bugs that may not be well documented with Gridsome yet, particularly routing side effects. Otherwise you may be left with something that works perfectly in development but is buggy on deployment.

1. `npm install -g http-server`
2. `gridsome build`
3. `http-server dist/` and go to one of the live servers it's given you
4. Clear cache and hard reload
5. Hop around
