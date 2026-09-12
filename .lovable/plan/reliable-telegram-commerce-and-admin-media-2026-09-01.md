# Reliable Telegram commerce and admin media

## Goal
Make every Telegram button respond immediately, automate completed-order delivery across bot and Mini App, and make catalog/media administration reliable and production-ready.

## Build
1. **Telegram interaction reliability**
   - Acknowledge callback queries before database/network work so Telegram buttons never remain stuck.
   - Validate callback IDs/parameters, surface failures to the user, and improve webhook error logging without exposing secrets.
   - Redesign category → subcategory → product navigation into compact, image-led catalog cards with stock, featured status, price, and clear back/cart actions.

2. **Automated purchase fulfillment**
   - Create one shared fulfillment service used by bot checkout and Mini App checkout.
   - After successful checkout, send an interactive confirmation plus a generated `.txt` receipt for each purchased item.
   - Key products include the full key and product/order details. File products include product/order details and the full download URL.
   - Keep fulfillment retry-safe and record delivery status so repeated requests do not consume or duplicate inventory.
   - Notify the admin about completed orders and failed deliveries.

3. **Mini App purchase library**
   - Return full order-item details from the authenticated Telegram Mini App API.
   - Add expandable order details with full keys/download links, copy/open/download controls, order metadata, and delivery status.
   - Show remaining stock on every product and add a featured-products section.

4. **Reliable admin catalog and media**
   - Fix product/category/settings payload mismatches and report database errors instead of silently accepting failed writes.
   - Add image fields to categories and subcategories, featured-product controls, stock visibility, and consistent hierarchy editing.
   - Create a public catalog-media storage bucket and authenticated admin upload function for direct banner/category/subcategory/product image uploads.
   - Validate file type/size and persist the resulting public URL to the selected record.

5. **Reusable communication templates**
   - Add admin-managed message templates for welcome, thank-you, advertising, support, payment, and custom situations.
   - Let the admin create/edit templates and load one into the broadcast composer before personalizing and sending.

## Data changes
- Add `products.is_featured`.
- Add order fulfillment tracking fields needed for idempotent Telegram delivery.
- Add an admin-only `message_templates` table with grants and row-level security.
- Create/configure the public catalog-media bucket with admin-only writes and public reads.

## Verification
- Type-check and inspect the latest build result.
- Exercise Telegram callbacks using signed webhook test updates.
- Run a disposable checkout/fulfillment test, verify the generated TXT document payload and Mini App order details, then remove test data.
- Test product, category, subcategory, settings, featured, template, and image-upload saves from the admin dashboard.
