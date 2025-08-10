export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  /** The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text. */
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  /** The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1. */
  Int: { input: number; output: number; }
  /** The `Float` scalar type represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point). */
  Float: { input: number; output: number; }
  Date: { input: string; output: string; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
};

export type Author = {
  __typename?: 'Author';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Author__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Scalars['String']['output']>;
  links?: Maybe<Author_Links>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Author_Links = {
  __typename?: 'Author_Links';
  github?: Maybe<Scalars['String']['output']>;
  instagram?: Maybe<Scalars['String']['output']>;
  website?: Maybe<Scalars['String']['output']>;
};

export type Author__Content = {
  __typename?: 'Author__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Author__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Author__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Category = {
  __typename?: 'Category';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Category__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  color?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Category__Content = {
  __typename?: 'Category__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Category__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Category__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Order =
  | 'ASC'
  | 'DESC';

export type Origin = {
  __typename?: 'Origin';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Origin__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  municipality?: Maybe<Scalars['String']['output']>;
};

export type Origin__Content = {
  __typename?: 'Origin__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Origin__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Origin__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Query = {
  __typename?: 'Query';
  /** Find one Author by its ID */
  Author?: Maybe<Author>;
  /** Find one Category by its ID */
  Category?: Maybe<Category>;
  /** Find one Origin by its ID */
  Origin?: Maybe<Origin>;
  /** Find one Session by its ID */
  Session?: Maybe<Session>;
  /** Find one Style by its ID */
  Style?: Maybe<Style>;
  /** Find one Tags by its ID */
  Tags?: Maybe<Tags>;
  /** Find one Varietal by its ID */
  Varietal?: Maybe<Varietal>;
  /** Find one Vendor by its ID */
  Vendor?: Maybe<Vendor>;
  /** Return a set of Authors */
  allAuthors?: Maybe<Array<Maybe<Author>>>;
  /** Return a set of Categories */
  allCategories?: Maybe<Array<Maybe<Category>>>;
  /** Return a set of Origins */
  allOrigins?: Maybe<Array<Maybe<Origin>>>;
  /** Return a set of Sessions */
  allSessions?: Maybe<Array<Maybe<Session>>>;
  /** Return a set of Styles */
  allStyles?: Maybe<Array<Maybe<Style>>>;
  /** Return a set of Tagses */
  allTagses?: Maybe<Array<Maybe<Tags>>>;
  /** Return a set of Varietals */
  allVarietals?: Maybe<Array<Maybe<Varietal>>>;
  /** Return a set of Vendors */
  allVendors?: Maybe<Array<Maybe<Vendor>>>;
};


export type QueryAuthorArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCategoryArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryOriginArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySessionArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryStyleArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTagsArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryVarietalArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryVendorArgs = {
  id?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllAuthorsArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllCategoriesArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllOriginsArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllSessionsArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllStylesArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllTagsesArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllVarietalsArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAllVendorsArgs = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};

export type Session = {
  __typename?: 'Session';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Session__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  aging_conditions?: Maybe<Scalars['String']['output']>;
  /** All Authors that are referenced by this Session */
  author?: Maybe<Array<Maybe<Author>>>;
  brewing?: Maybe<Session_Brewing>;
  /** All Varietals that are referenced by this Session */
  cultivar?: Maybe<Array<Maybe<Varietal>>>;
  date?: Maybe<Scalars['Date']['output']>;
  elevation?: Maybe<Scalars['Float']['output']>;
  excerpt?: Maybe<Scalars['String']['output']>;
  flavor_axes?: Maybe<Session_Flavor_Axes>;
  genre?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  id?: Maybe<Scalars['String']['output']>;
  images?: Maybe<Array<Maybe<Session_Images>>>;
  notes?: Maybe<Session_Notes>;
  /** All Origins that are referenced by this Session */
  origin?: Maybe<Array<Maybe<Origin>>>;
  picking?: Maybe<Scalars['String']['output']>;
  production_year?: Maybe<Scalars['Float']['output']>;
  purchase_link?: Maybe<Scalars['String']['output']>;
  rating?: Maybe<Scalars['Float']['output']>;
  season?: Maybe<Scalars['String']['output']>;
  /** All Styles that are referenced by this Session */
  style?: Maybe<Array<Maybe<Style>>>;
  /** All Tagses that are referenced by this Session */
  tags?: Maybe<Array<Maybe<Tags>>>;
  tea_name?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  /** All Vendors that are referenced by this Session */
  vendor?: Maybe<Array<Maybe<Vendor>>>;
};


export type SessionAuthorArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type SessionCultivarArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type SessionOriginArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type SessionStyleArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type SessionTagsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};


export type SessionVendorArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Order>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<Scalars['String']['input']>;
};

export type Session_Brewing = {
  __typename?: 'Session_Brewing';
  first_infusion_duration?: Maybe<Scalars['Float']['output']>;
  infusion_increment?: Maybe<Scalars['Float']['output']>;
  liquid_amount?: Maybe<Scalars['Float']['output']>;
  material_amount?: Maybe<Scalars['Float']['output']>;
  temperature?: Maybe<Scalars['Float']['output']>;
  vessel?: Maybe<Scalars['String']['output']>;
};

export type Session_Flavor_Axes = {
  __typename?: 'Session_Flavor_axes';
  cream?: Maybe<Session_Flavor_Axes_Cream>;
  earth?: Maybe<Session_Flavor_Axes_Earth>;
  floral?: Maybe<Session_Flavor_Axes_Floral>;
  fruits?: Maybe<Session_Flavor_Axes_Fruits>;
  nuts_roast?: Maybe<Session_Flavor_Axes_Nuts_Roast>;
  spices?: Maybe<Session_Flavor_Axes_Spices>;
  stone?: Maybe<Session_Flavor_Axes_Stone>;
  umami?: Maybe<Session_Flavor_Axes_Umami>;
  vegetal?: Maybe<Session_Flavor_Axes_Vegetal>;
  wood?: Maybe<Session_Flavor_Axes_Wood>;
};

export type Session_Flavor_Axes_Cream = {
  __typename?: 'Session_Flavor_axes_Cream';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Earth = {
  __typename?: 'Session_Flavor_axes_Earth';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Floral = {
  __typename?: 'Session_Flavor_axes_Floral';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Fruits = {
  __typename?: 'Session_Flavor_axes_Fruits';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Nuts_Roast = {
  __typename?: 'Session_Flavor_axes_Nuts_roast';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Spices = {
  __typename?: 'Session_Flavor_axes_Spices';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Stone = {
  __typename?: 'Session_Flavor_axes_Stone';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Umami = {
  __typename?: 'Session_Flavor_axes_Umami';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Vegetal = {
  __typename?: 'Session_Flavor_axes_Vegetal';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Flavor_Axes_Wood = {
  __typename?: 'Session_Flavor_axes_Wood';
  finish?: Maybe<Scalars['Float']['output']>;
  start?: Maybe<Scalars['Float']['output']>;
};

export type Session_Images = {
  __typename?: 'Session_Images';
  alt?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Scalars['String']['output']>;
};

export type Session_Notes = {
  __typename?: 'Session_Notes';
  cha_qi?: Maybe<Scalars['String']['output']>;
  dry_leaf_nose?: Maybe<Scalars['String']['output']>;
  empty_cup?: Maybe<Scalars['String']['output']>;
  finish?: Maybe<Scalars['String']['output']>;
  mouthfeel?: Maybe<Scalars['String']['output']>;
  taste?: Maybe<Scalars['String']['output']>;
  wet_leaf_nose?: Maybe<Scalars['String']['output']>;
};

export type Session__Content = {
  __typename?: 'Session__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Session__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Session__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Style = {
  __typename?: 'Style';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Style__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  /** The Category referenced by this Style */
  category?: Maybe<Category>;
  color?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  genre_id?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Style__Content = {
  __typename?: 'Style__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Style__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Style__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Tags = {
  __typename?: 'Tags';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Tags__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  color?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Tags__Content = {
  __typename?: 'Tags__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Tags__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Tags__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Varietal = {
  __typename?: 'Varietal';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Varietal__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  styles?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Varietal__Content = {
  __typename?: 'Varietal__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Varietal__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Varietal__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};

export type Vendor = {
  __typename?: 'Vendor';
  /** The collection name */
  _collection?: Maybe<Scalars['String']['output']>;
  _content?: Maybe<Vendor__Content>;
  _filename?: Maybe<Scalars['String']['output']>;
  _path?: Maybe<Scalars['String']['output']>;
  _slug?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Scalars['String']['output']>;
  links?: Maybe<Vendor_Links>;
  location?: Maybe<Scalars['String']['output']>;
  municipality?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type Vendor_Links = {
  __typename?: 'Vendor_Links';
  facebook?: Maybe<Scalars['String']['output']>;
  instagram?: Maybe<Scalars['String']['output']>;
  twitter?: Maybe<Scalars['String']['output']>;
  website?: Maybe<Scalars['String']['output']>;
  youtube?: Maybe<Scalars['String']['output']>;
};

export type Vendor__Content = {
  __typename?: 'Vendor__content';
  /** A plaintext excerpt taken from the main content */
  excerpt?: Maybe<Scalars['String']['output']>;
  /** The content as HTML */
  html?: Maybe<Scalars['String']['output']>;
  raw?: Maybe<Scalars['String']['output']>;
  /** How long (in minutes) it would take an average reader to read the main content. */
  timeToRead?: Maybe<Scalars['Int']['output']>;
};


export type Vendor__ContentExcerptArgs = {
  length?: InputMaybe<Scalars['Int']['input']>;
};


export type Vendor__ContentTimeToReadArgs = {
  speed?: InputMaybe<Scalars['Int']['input']>;
};
