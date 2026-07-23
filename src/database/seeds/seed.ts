import { connect, disconnect, Types } from 'mongoose';

/**
 * Comprehensive seed script for PPD Store database
 * Seeds categories (with subcategories), products, packages, and banners
 */

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ppd-store';

interface CategoryData {
  slug: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
  image?: string;
  parentId?: string | null;
}

interface ProductData {
  slug: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
  description?: string;
  shortDescription?: string;
  highlights?: string[];
  images?: string[];
  rating?: number;
  ratingCount?: number;
  tags?: string[];
}

interface PackageData {
  slug: string;
  name: string;
  description: string;
  image?: string;
  price?: number;
  items: Array<{ productId: string; quantity: number }>;
  sortOrder: number;
  isActive: boolean;
}

interface BannerData {
  title: string;
  type: 'static' | 'carousel';
  placement: 'hero' | 'bundle';
  subtitle?: string;
  cta?: string;
  href?: string;
  image?: string;
  tone?: string;
  items?: Array<{ title: string; image: string; href: string; subtitle?: string; cta?: string }>;
  sortOrder: number;
  isActive: boolean;
}

async function seed() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    const connection = await connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = connection.connection.db;

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await db?.dropCollection('categories').catch(() => {});
    await db?.dropCollection('products').catch(() => {});
    await db?.dropCollection('packages').catch(() => {});
    await db?.dropCollection('banners').catch(() => {});

    // ============ CATEGORIES ============
    console.log('📦 Seeding categories...');

    const categoriesCollection = db?.collection('categories');
    const categoryDocs = new Map<string, any>();

    const parentCategories: CategoryData[] = [
      {
        slug: 'all',
        name: 'All',
        icon: '🏷️',
        description: 'All products',
        sortOrder: 0,
      },
      {
        slug: 'books',
        name: 'Books',
        icon: '📚',
        description: 'Books, learning resources in one place.',
        sortOrder: 1,
      },
      {
        slug: 'stationery',
        name: 'Stationery',
        icon: '✏️',
        description: 'Pens, pencils, markers and everyday writing tools.',
        sortOrder: 2,
      },
      {
        slug: 'for-kids',
        name: 'For Kids',
        icon: '🧸',
        description: 'Fun, educational and creative products for kids.',
        sortOrder: 3,
      },
      {
        slug: 'bags',
        name: 'Bags',
        icon: '🎒',
        description: 'Backpacks, bags and carrying solutions.',
        sortOrder: 4,
      },
    ];

    // Insert parent categories
    for (const cat of parentCategories) {
      const doc = await categoriesCollection?.insertOne({
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        description: cat.description,
        sortOrder: cat.sortOrder,
        parentId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      categoryDocs.set(cat.slug, doc?.insertedId);
    }

    // Subcategories
    const subCategories: Array<{ parent: string; category: CategoryData }> = [
      {
        parent: 'books',
        category: {
          slug: 'textbooks',
          name: 'Textbooks',
          icon: '📖',
          description: 'School and college textbooks',
          sortOrder: 1,
        },
      },
      {
        parent: 'books',
        category: {
          slug: 'story-books',
          name: 'Story Books',
          icon: '📕',
          description: 'Fiction and story collections',
          sortOrder: 2,
        },
      },
      {
        parent: 'stationery',
        category: {
          slug: 'notebooks',
          name: 'Notebooks',
          icon: '📓',
          description: 'Exercise books and notepads',
          sortOrder: 1,
        },
      },
      {
        parent: 'stationery',
        category: {
          slug: 'writing-instruments',
          name: 'Writing Instruments',
          icon: '🖊️',
          description: 'Pens, pencils and markers',
          sortOrder: 2,
        },
      },
      {
        parent: 'for-kids',
        category: {
          slug: 'toys',
          name: 'Toys',
          icon: '🎲',
          description: 'Educational and fun toys',
          sortOrder: 1,
        },
      },
      {
        parent: 'for-kids',
        category: {
          slug: 'art-supplies',
          name: 'Art Supplies',
          icon: '🎨',
          description: 'Colors, crayons and art materials',
          sortOrder: 2,
        },
      },
      {
        parent: 'bags',
        category: {
          slug: 'school-bags',
          name: 'School Bags',
          icon: '🎒',
          description: 'Durable school backpacks',
          sortOrder: 1,
        },
      },
      {
        parent: 'bags',
        category: {
          slug: 'accessories',
          name: 'Bag Accessories',
          icon: '🧵',
          description: 'Locks, straps and accessories',
          sortOrder: 2,
        },
      },
    ];

    // Insert subcategories
    for (const { parent, category } of subCategories) {
      const parentId = categoryDocs.get(parent);
      const doc = await categoriesCollection?.insertOne({
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        description: category.description,
        sortOrder: category.sortOrder,
        parentId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      categoryDocs.set(category.slug, doc?.insertedId);
    }

    console.log(`✅ Seeded ${categoryDocs.size} categories`);

    // ============ PRODUCTS ============
    console.log('📚 Seeding products...');

    const productsCollection = db?.collection('products');
    const productDocs = new Map<string, any>();

    const products: ProductData[] = [
      // Books
      {
        slug: 'ncert-mathematics-class-10',
        title: 'NCERT Mathematics Class 10',
        brand: 'NCERT',
        category: 'books',
        price: 180,
        mrp: 220,
        stock: 50,
        shortDescription: 'Official NCERT mathematics textbook',
        highlights: ['CBSE Approved', 'Complete Solutions', 'Practice Problems'],
        rating: 4.5,
        ratingCount: 120,
        tags: ['featured', 'bestseller'],
      },
      {
        slug: 'science-textbook-cbse-9',
        title: 'Science Textbook CBSE Class 9',
        brand: 'NCERT',
        category: 'books',
        price: 200,
        mrp: 250,
        stock: 40,
        shortDescription: 'Complete science curriculum for class 9',
        highlights: ['Lab Activities', 'Diagrams', 'Chapter Summaries'],
        rating: 4.3,
        ratingCount: 85,
        tags: ['bestseller'],
      },
      {
        slug: 'english-reader-class-8',
        title: 'English Reader Class 8',
        brand: 'NCERT',
        category: 'books',
        price: 150,
        mrp: 190,
        stock: 60,
        shortDescription: 'English literature and grammar textbook',
        rating: 4,
        ratingCount: 60,
      },

      // Stationery
      {
        slug: 'premium-notebook-200-pages',
        title: 'Premium Notebook 200 Pages',
        brand: 'Classmate',
        category: 'stationery',
        price: 80,
        mrp: 120,
        stock: 200,
        shortDescription: 'Soft cover notebook with quality paper',
        highlights: ['Durable Binding', 'Quality Paper', 'Lined Pages'],
        rating: 4.4,
        ratingCount: 250,
        tags: ['bestseller'],
      },
      {
        slug: 'gel-pen-pack-10',
        title: 'Gel Pen Pack (10 pieces)',
        brand: 'Reynolds',
        category: 'stationery',
        price: 120,
        mrp: 180,
        stock: 150,
        shortDescription: 'Smooth writing gel pens',
        highlights: ['0.7mm tip', 'Smooth Ink Flow', 'Ergonomic Design'],
        rating: 4.2,
        ratingCount: 300,
        tags: ['deal', 'bestseller'],
      },
      {
        slug: 'colored-pencils-36-set',
        title: 'Colored Pencils 36 Set',
        brand: 'Faber-Castell',
        category: 'stationery',
        price: 450,
        mrp: 599,
        stock: 80,
        shortDescription: 'Professional quality colored pencils',
        highlights: ['Vivid Colors', 'Smooth Texture', 'Professional Grade'],
        rating: 4.6,
        ratingCount: 180,
        tags: ['new'],
      },
      {
        slug: 'whiteboard-marker-pack-5',
        title: 'Whiteboard Marker Pack (5)',
        brand: 'Camlin',
        category: 'stationery',
        price: 99,
        mrp: 150,
        stock: 120,
        shortDescription: 'Non-permanent whiteboard markers',
        rating: 4.1,
        ratingCount: 95,
      },

      // For Kids
      {
        slug: 'educational-puzzle-animals',
        title: 'Educational Animal Puzzle',
        brand: 'PlayKool',
        category: 'for-kids',
        price: 299,
        mrp: 499,
        stock: 75,
        shortDescription: 'Wooden puzzle with animal shapes',
        highlights: ['Wood Material', '30 Pieces', 'Educational'],
        rating: 4.5,
        ratingCount: 140,
        tags: ['new'],
      },
      {
        slug: 'watercolor-set-24-colors',
        title: 'Watercolor Paint Set 24 Colors',
        brand: 'Camlin',
        category: 'for-kids',
        price: 199,
        mrp: 299,
        stock: 90,
        shortDescription: 'Complete watercolor painting set for kids',
        highlights: ['24 Colors', 'Non-toxic', 'Mixing Palette Included'],
        rating: 4.3,
        ratingCount: 110,
        tags: ['featured'],
      },
      {
        slug: 'craft-paper-roll-100',
        title: 'Craft Paper Roll 100m',
        brand: 'Kraftpaper',
        category: 'for-kids',
        price: 129,
        mrp: 199,
        stock: 100,
        shortDescription: 'Brown kraft paper roll for art projects',
        rating: 4,
        ratingCount: 50,
      },

      // Bags
      {
        slug: 'ergonomic-school-backpack-blue',
        title: 'Ergonomic School Backpack (Blue)',
        brand: 'Skybags',
        category: 'bags',
        price: 1299,
        mrp: 1999,
        stock: 45,
        shortDescription: 'Durable backpack with ergonomic design',
        highlights: ['Waterproof', 'Multiple Compartments', 'Adjustable Straps'],
        rating: 4.6,
        ratingCount: 200,
        tags: ['bestseller', 'featured'],
      },
      {
        slug: 'laptop-backpack-15inch',
        title: 'Laptop Backpack 15 Inch',
        brand: 'Targus',
        category: 'bags',
        price: 1899,
        mrp: 2999,
        stock: 30,
        shortDescription: 'Professional laptop backpack',
        highlights: ['USB Port', 'Anti-Theft', 'Laptop Protection'],
        rating: 4.7,
        ratingCount: 220,
        tags: ['new'],
      },
    ];

    for (const prod of products) {
      const doc = await productsCollection?.insertOne({
        slug: prod.slug,
        title: prod.title,
        brand: prod.brand,
        category: prod.category,
        price: prod.price,
        mrp: prod.mrp,
        stock: prod.stock,
        description: prod.description || '',
        shortDescription: prod.shortDescription || '',
        highlights: prod.highlights || [],
        images: prod.images || [],
        rating: prod.rating || 0,
        ratingCount: prod.ratingCount || 0,
        reviewCount: 0,
        tags: prod.tags || [],
        status: 'published',
        isActive: true,
        isPpdOriginal: false,
        isFreeDelivery: false,
        deliveryDays: 2,
        returnDays: 7,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      productDocs.set(prod.slug, doc?.insertedId);
    }

    console.log(`✅ Seeded ${productDocs.size} products`);

    // ============ PACKAGES ============
    console.log('📦 Seeding packages...');

    const packagesCollection = db?.collection('packages');

    const packages: PackageData[] = [
      {
        slug: 'school-starter-pack',
        name: 'School Starter Pack',
        description: 'Complete essentials to start your school year',
        sortOrder: 1,
        price: 699,
        isActive: true,
        items: [
          { productId: productDocs.get('premium-notebook-200-pages'), quantity: 2 },
          { productId: productDocs.get('gel-pen-pack-10'), quantity: 1 },
          { productId: productDocs.get('whiteboard-marker-pack-5'), quantity: 1 },
        ],
      },
      {
        slug: 'art-lover-bundle',
        name: 'Art Lover Bundle',
        description: 'Everything an artist needs',
        sortOrder: 2,
        price: 799,
        isActive: true,
        items: [
          { productId: productDocs.get('colored-pencils-36-set'), quantity: 1 },
          { productId: productDocs.get('watercolor-set-24-colors'), quantity: 1 },
          { productId: productDocs.get('craft-paper-roll-100'), quantity: 1 },
        ],
      },
      {
        slug: 'student-combo',
        name: 'Student Combo Pack',
        description: 'Books and essentials for students',
        sortOrder: 3,
        price: 549,
        isActive: true,
        items: [
          { productId: productDocs.get('ncert-mathematics-class-10'), quantity: 1 },
          { productId: productDocs.get('premium-notebook-200-pages'), quantity: 1 },
          { productId: productDocs.get('gel-pen-pack-10'), quantity: 1 },
        ],
      },
    ];

    for (const pkg of packages) {
      const items = pkg.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));

      await packagesCollection?.insertOne({
        slug: pkg.slug,
        name: pkg.name,
        description: pkg.description,
        image: pkg.image || '',
        items,
        price: pkg.price,
        sortOrder: pkg.sortOrder,
        isActive: pkg.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`✅ Seeded ${packages.length} packages`);

    // ============ BANNERS ============
    console.log('🖼️  Seeding banners...');

    const bannersCollection = db?.collection('banners');

    const banners: BannerData[] = [
      {
        title: 'Smart School Shopping',
        type: 'static',
        placement: 'hero',
        subtitle: 'Find Everything For Your School',
        cta: 'Shop Now',
        href: '/categories/all',
        image: '/uploads/2026/07/5f774836-7995-476e-8ed6-7c563978c6e8.png',
        tone: 'bg-gradient-to-r from-red-500 to-red-600',
        sortOrder: 0,
        isActive: true,
      },
      {
        title: 'Back to School Sale',
        type: 'static',
        placement: 'hero',
        subtitle: 'Up to 30% off notebooks, kits & more',
        cta: 'Explore Deals',
        href: '/categories/stationery?tag=deal',
        image: '/uploads/2026/07/6d31bcf5-7174-4edc-8ffd-25ca03b70194.jpg',
        tone: 'bg-gradient-to-r from-blue-500 to-blue-600',
        sortOrder: 1,
        isActive: true,
      },
      {
        title: 'Monsoon Ready Kids',
        type: 'static',
        placement: 'hero',
        subtitle: 'Umbrellas, raincoats and bag covers',
        cta: 'Shop Now',
        href: '/categories/for-kids',
        image: '/uploads/2026/07/7cbb2fe9-34f1-4f72-8366-e49ec913af18.png',
        tone: 'bg-gradient-to-r from-teal-500 to-teal-600',
        sortOrder: 2,
        isActive: true,
      },
      {
        title: 'From the House of PPD',
        type: 'static',
        placement: 'bundle',
        subtitle: 'Curated collections for every need',
        cta: 'Explore',
        href: '/packages',
        image: '/uploads/2026/07/7f41fe31-ad39-4f3a-a7cd-854da855ae44.png',
        tone: 'bg-gradient-to-r from-orange-400 to-orange-600',
        sortOrder: 3,
        isActive: true,
      },
      {
        title: 'Student Essentials Carousel',
        type: 'carousel',
        placement: 'hero',
        sortOrder: 4,
        isActive: true,
        items: [
          {
            title: 'Books & Learning',
            subtitle: 'NCERT and reference books',
            cta: 'Browse',
            href: '/categories/books',
            image: '/uploads/2026/07/cee4514f-3be7-44a7-8875-a250a371a7d8.png',
          },
          {
            title: 'Stationery Supplies',
            subtitle: 'Pens, pencils & more',
            cta: 'Shop',
            href: '/categories/stationery',
            image: '/uploads/2026/07/e66db073-48e2-4117-a293-4f9dfe073fb4.jpg',
          },
          {
            title: 'Bags & Accessories',
            subtitle: 'Durable school bags',
            cta: 'View',
            href: '/categories/bags',
            image: '/uploads/2026/07/eb23af79-dcfc-41d3-ad47-31a5927193eb.jpg',
          },
        ],
      },
    ];

    for (const banner of banners) {
      await bannersCollection?.insertOne({
        title: banner.title,
        type: banner.type,
        placement: banner.placement,
        subtitle: banner.subtitle || '',
        cta: banner.cta || 'Shop Now',
        href: banner.href || '/',
        image: banner.image || '',
        tone: banner.tone || 'bg-gradient-to-r from-orange-400 to-orange-600',
        items: banner.items || [],
        sortOrder: banner.sortOrder,
        isActive: banner.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`✅ Seeded ${banners.length} banners`);

    console.log('');
    console.log('🎉 Seed completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Categories: ${categoryDocs.size}`);
    console.log(`   - Products: ${productDocs.size}`);
    console.log(`   - Packages: ${packages.length}`);
    console.log(`   - Banners: ${banners.length}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

void seed();
