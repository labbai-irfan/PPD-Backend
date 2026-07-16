# Recommendation System Documentation

## Overview

The recommendation system provides intelligent product recommendations based on user behavior and purchase history. It automatically switches between two strategies:

1. **Trending Recommendations** - For new/unauthenticated users: top products by sales quantity
2. **Personalized Recommendations** - For users with purchase history: top products from their favorite categories

## API Endpoints

### 1. Smart Recommendations (Recommended)
**GET** `/recommendations`

Automatically selects the best recommendation strategy:
- For authenticated users with purchase history → personalized
- For unauthenticated users or new customers → trending

**Query Parameters:**
- `limit` (optional, default: 10, max: 50) - Number of products to return

**Example:**
```bash
curl -H "Authorization: Bearer token" \
  "http://localhost:3000/recommendations?limit=12"
```

**Response:**
```json
[
  {
    "_id": "...",
    "title": "Product Name",
    "price": 999,
    "rating": 4.5,
    "category": "electronics",
    "salesCount": 150,
    ...
  },
  ...
]
```

---

### 2. Trending Recommendations
**GET** `/recommendations/trending`

Returns top products based on sales quantity (for all users, no auth required).

**Query Parameters:**
- `limit` (optional, default: 10, max: 50)

**Use Cases:**
- Homepage hero section
- New user onboarding
- Anonymous browsing

**Example:**
```bash
curl "http://localhost:3000/recommendations/trending?limit=8"
```

---

### 3. Personalized Recommendations
**GET** `/recommendations/for-me`

Returns personalized recommendations based on user's purchase history.
Requires authentication.

**Query Parameters:**
- `limit` (optional, default: 10, max: 50)

**Behavior:**
- If user has purchases: returns top products from their favorite categories
- If user has no purchases: falls back to trending products
- Excludes already-purchased products

**Example:**
```bash
curl -H "Authorization: Bearer token" \
  "http://localhost:3000/recommendations/for-me?limit=10"
```

---

### 4. Category-based Recommendations
**GET** `/recommendations/by-category/:category`

Returns top-rated products from a specific category.

**Query Parameters:**
- `exclude` (optional) - Product ID to exclude from results
- `limit` (optional, default: 10, max: 50)

**Use Cases:**
- Product detail page (show more from this category)
- Category browsing
- Product variants

**Example:**
```bash
curl "http://localhost:3000/recommendations/by-category/electronics?exclude=productId&limit=8"
```

---

### 5. Recommendation Stats
**GET** `/recommendations/stats`

Returns recommendation statistics for the current user.
Requires authentication.

**Response:**
```json
{
  "hasPurchaseHistory": true,
  "favoriteCategories": ["electronics", "accessories", "clothing"],
  "totalOrdersCount": 5
}
```

**Use Cases:**
- Show user personalization status
- Display user insights
- Debug recommendation strategy selection

---

## Frontend Integration

### React Hooks

#### useTrendingRecommendations
```typescript
import { useTrendingRecommendations } from '@/hooks/use-recommendations'

function TrendingSection() {
  const { data: products, isLoading } = useTrendingRecommendations(12)
  
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div className="grid grid-cols-4 gap-4">
      {products?.map(product => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  )
}
```

#### usePersonalizedRecommendations
```typescript
import { usePersonalizedRecommendations } from '@/hooks/use-recommendations'
import { useAuthStore } from '@/store/auth'

function PersonalizedSection() {
  const { user } = useAuthStore()
  const { data: products, isLoading } = usePersonalizedRecommendations(10, !!user)
  
  if (!user) return <TrendingSection />
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div className="space-y-4">
      <h2>Recommended for You</h2>
      <ProductGrid products={products} />
    </div>
  )
}
```

#### useSmartRecommendations (Best Choice)
```typescript
import { useSmartRecommendations } from '@/hooks/use-recommendations'

function SmartRecommendationsSection() {
  const { data: products, isLoading } = useSmartRecommendations(12)
  
  if (isLoading) return <Skeleton />
  
  return (
    <div className="bg-gray-50 p-8">
      <h2>Recommended For You</h2>
      <ProductGrid products={products} />
    </div>
  )
}
```

#### useRecommendationsByCategory
```typescript
import { useRecommendationsByCategory } from '@/hooks/use-recommendations'
import { useProduct } from '@/hooks/use-catalog'

function ProductDetailRelated({ productId }: { productId: string }) {
  const { data: product } = useProduct(productId)
  const { data: related, isLoading } = useRecommendationsByCategory(
    product?.category,
    productId,
    8,
    !!product
  )
  
  return (
    <section>
      <h3>More in {product?.category}</h3>
      <ProductGrid products={related} />
    </section>
  )
}
```

#### useRecommendationStats
```typescript
import { useRecommendationStats } from '@/hooks/use-recommendations'
import { useAuthStore } from '@/store/auth'

function UserInsights() {
  const { user } = useAuthStore()
  const { data: stats } = useRecommendationStats(!!user)
  
  if (!stats) return null
  
  return (
    <div className="p-4 bg-blue-50 rounded">
      <p>Purchase History: {stats.hasPurchaseHistory ? 'Yes' : 'No'}</p>
      {stats.favoriteCategories.length > 0 && (
        <div>
          <p>Your Categories:</p>
          <ul>
            {stats.favoriteCategories.map(cat => (
              <li key={cat}>{cat}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

---

## Recommendation Strategy

### For Users WITHOUT Purchase History

**Trigger:** New users, unauthenticated users, or users who haven't completed a delivery

**Algorithm:**
1. Query products with `isActive: true` and `stock > 0`
2. Sort by `salesCount DESC` (highest sales first)
3. Then by `ratingCount DESC` (most rated)
4. Return top N products

**Why:** Popular items indicate quality and customer satisfaction

### For Users WITH Purchase History

**Trigger:** Authenticated users with delivered orders

**Algorithm:**
1. Get all delivered orders for the user
2. Extract categories from purchased products
3. Query products from those categories
4. Exclude already-purchased items
5. Sort by `rating DESC`, `ratingCount DESC`, `salesCount DESC`
6. If insufficient results, supplement with trending products from other categories

**Why:** Category preference indicates user interest, avoiding duplicate purchases improves UX

---

## Database Indexes

The recommendation system relies on these indexes:

```typescript
// In Product schema
ProductSchema.index({ category: 1, isActive: 1 })
ProductSchema.index({ tags: 1 })
ProductSchema.index({ salesCount: -1 })
ProductSchema.index({ rating: -1, ratingCount: -1 })

// In Order schema
OrderSchema.index({ userId: 1, createdAt: -1 })
OrderSchema.index({ status: 1, createdAt: -1 })
```

---

## Configuration & Tuning

### Adjustment Points

**Maximum Results (limit cap):**
- File: `recommendations.service.ts`
- Change: `Math.min(limit, 50)` in recommendation methods
- Default: 50 products max

**Supplementation Threshold:**
- File: `recommendations.service.ts`
- When: `recommendations.length < limit`
- Then: Fill remaining slots with trending products
- Adjustable in `getPersonalizedRecommendations`

**Sort Order (Personalized):**
```typescript
// Change the sort fields to adjust priority
.sort({ rating: -1, ratingCount: -1, salesCount: -1 })
```

### Performance Considerations

**Query Complexity:**
- Trending: Single aggregation (1-2ms)
- Personalized: 2-3 queries via aggregation (5-15ms)
- By Category: Single query (2-5ms)

**Caching Strategy:**
- Frontend uses React Query with default stale-while-revalidate
- Recommendations refresh every 5 minutes when stale
- Adjust cache time in React Query config if needed

---

## Analytics & Monitoring

### Metrics to Track

1. **Recommendation CTR (Click-Through Rate)**
   - Track clicks on recommended products
   - Compare trending vs personalized CTR

2. **Conversion Rate**
   - What % of recommendations lead to purchases?
   - Which categories convert best?

3. **Recommendation Type Distribution**
   - How many users get personalized vs trending?
   - Indicates new vs returning user ratio

4. **Average Order Value**
   - Do recommendations increase AOV?
   - Compare orders with/without recommendations

### Logging

The service uses NestJS logger. Add logging:
```typescript
this.logger.debug(`Loaded ${recommendations.length} for user ${userId}`)
this.logger.warn(`Failed to get recommendations: ${error.message}`)
```

---

## Troubleshooting

### No Recommendations Returned

**Issue:** Empty recommendations list

**Causes:**
1. No active products in database
2. All products out of stock (`stock <= 0`)
3. User has purchased all products in their categories

**Solution:**
- Check database for active products
- Verify stock quantities
- Supplement with trending fallback (already implemented)

### Slow Performance

**Issue:** Recommendations taking > 100ms

**Causes:**
1. Missing database indexes
2. Too many orders to process
3. Large collection size

**Solution:**
1. Verify indexes are created:
   ```bash
   db.orders.getIndexes()
   db.products.getIndexes()
   ```
2. Implement pagination for user orders
3. Add caching layer (Redis)

### Wrong Recommendations

**Issue:** Recommendations don't match user interests

**Causes:**
1. Too few orders to establish pattern
2. Sort priority not matching your business goals
3. Mixed category users

**Solution:**
1. Check user's favorite categories via `/recommendations/stats`
2. Adjust sort order in service
3. A/B test different algorithms

---

## Future Enhancements

1. **Collaborative Filtering**
   - Recommend products similar to what similar users bought

2. **Content-Based Filtering**
   - Recommend based on product features/tags
   - Weight by user preferences

3. **Hybrid Approach**
   - Combine multiple algorithms
   - ML-based scoring

4. **Time-Decay**
   - Recent purchases more relevant than old ones
   - Seasonal products

5. **A/B Testing**
   - Test different recommendation strategies
   - Optimize for conversion vs engagement

6. **Real-Time Updates**
   - WebSocket updates when new products arrive
   - Live trending updates

---

## API Response Types

```typescript
// Product type (from /types)
interface Product {
  _id: string
  slug: string
  title: string
  brand: string
  category: string
  description: string
  highlights: string[]
  images: string[]
  price: number
  mrp: number
  stock: number
  rating: number
  ratingCount: number
  reviewCount: number
  salesCount: number
  tags: string[]
  isPpdOriginal: boolean
  isFreeDelivery: boolean
  deliveryDays: number
  returnDays: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Stats type
interface RecommendationStats {
  hasPurchaseHistory: boolean
  favoriteCategories: string[]
  totalOrdersCount: number
}
```

---

## Testing

### Manual Testing

```bash
# Trending recommendations
curl "http://localhost:3000/recommendations/trending?limit=5"

# Personalized (with auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/recommendations/for-me?limit=5"

# Stats (with auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/recommendations/stats"

# Category-based
curl "http://localhost:3000/recommendations/by-category/electronics?limit=5"
```

### Unit Tests

Create `recommendations.service.spec.ts`:

```typescript
describe('RecommendationsService', () => {
  describe('getTrendingRecommendations', () => {
    it('should return top products by sales count', async () => {
      // Test implementation
    })
  })

  describe('getPersonalizedRecommendations', () => {
    it('should return category products when user has purchase history', async () => {
      // Test implementation
    })

    it('should return trending products when user has no history', async () => {
      // Test implementation
    })
  })
})
```

---

## License

This recommendation system is part of the PPD (Product Purchasing Database) project.
