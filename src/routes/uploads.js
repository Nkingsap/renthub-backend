import { json, err } from '../lib/response.js';

/**
 * Image upload route
 * POST /api/upload/image   multipart/form-data with field "file"
 * Returns: { url: "https://xxx.supabase.co/storage/v1/object/public/listing-images/xxx.jpg" }
 */
export async function handleUploads(request, supabase, env, path) {
    const method = request.method;

    if (method === 'POST' && path === '/api/upload/image') {
        let formData;
        try {
            formData = await request.formData();
        } catch {
            return err('Request must be multipart/form-data');
        }

        const file = formData.get('file');
        if (!file || typeof file === 'string') {
            return err('Missing file field in form data');
        }

        // Build a unique file name: timestamp + original name
        const ext = file.name?.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const arrayBuffer = await file.arrayBuffer();

        const { data, error } = await supabase.storage
            .from('listing-images')
            .upload(fileName, arrayBuffer, {
                contentType: file.type || 'image/jpeg',
                upsert: false,
            });

        if (error) return err(error.message, 500);

        // Build the public URL
        const { data: { publicUrl } } = supabase.storage
            .from('listing-images')
            .getPublicUrl(data.path);

        return json({ url: publicUrl }, 201);
    }

    return null; // route not matched
}
