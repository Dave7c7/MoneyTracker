/**
 * Reading an uploaded export.
 *
 * The file is read on the server, in the request, and never stored: the
 * browser keeps the file and sends it again for the preview and for the
 * import. Nothing about a bank export needs to outlive the request.
 */

import 'server-only';

import { z } from 'zod';

/** The largest file the app reads. A bank export is far smaller. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** What a successful upload holds. */
export interface UploadedFile {
  fileName: string;
  content: string;
}

/** The form of a request that carries a file and a profile. */
export const uploadFormSchema = z.object({
  profileId: z.string().uuid(),
});

/**
 * Reads the file and the profile id from a request.
 *
 * @example
 * const upload = await readUpload(request);
 * if (!upload.ok) return upload.response;
 */
export async function readUpload(
  request: Request,
): Promise<
  { ok: true; data: { file: UploadedFile; profileId: string } } | { ok: false; response: Response }
> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'The request did not carry a file' }, { status: 400 }),
    };
  }

  const profile = uploadFormSchema.safeParse({ profileId: form.get('profileId') });
  if (!profile.success) {
    return {
      ok: false,
      response: Response.json({ error: 'The request did not name a profile' }, { status: 400 }),
    };
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: Response.json({ error: 'The request did not carry a file' }, { status: 400 }),
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: Response.json(
        { error: 'That file is too large. Bank exports are usually a few megabytes.' },
        { status: 413 },
      ),
    };
  }

  const content = await file.text();

  return {
    ok: true,
    data: {
      file: { fileName: file.name || 'export.csv', content },
      profileId: profile.data.profileId,
    },
  };
}
