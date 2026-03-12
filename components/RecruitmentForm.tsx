"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { uploadFile } from "@/app/actions/uploadFile";
import { createClient } from "@/lib/supabase/client";
import { revalidateAdminData } from "@/app/actions/revalidate";
import { FormFieldRenderer, FieldConfig } from "./FormFieldRenderer";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RecruitmentForm({ recruitment }: { recruitment: any }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const supabase = createClient();

    const dynamicFields: FieldConfig[] = (recruitment.form_fields || []).map((f: FieldConfig) => ({
        ...f,
        id: f.id.replace(/\./g, '_')
    }));

    // Always present PMK fields
    const pmkFields: FieldConfig[] = [
        {
            id: "pokok_doa",
            type: "long_text",
            label: "🕊️ Pokok Doa & Motivasi Pelayanan",
            placeholder: "Tuliskan motivasi pelayananmu dan hal apa yang bisa kami doakan untukmu...",
            required: true,
        },
        {
            id: "kesaksian_iman",
            type: "long_text",
            label: "✝️ Kesaksian Iman (Opsional)",
            placeholder: "Bagaimana perjumpaanmu dengan Kristus atau pengalaman rohani yang berkesan? (Boleh dikosongkan)",
            required: false,
        }
    ];

    // Base fixed fields
    const fixedFields: FieldConfig[] = [
        { id: "applicant_name", type: "short_text", label: "Nama Lengkap", required: true },
        { id: "applicant_nim", type: "short_text", label: "NIM", required: true },
        { id: "applicant_email", type: "short_text", label: "Email", required: true, placeholder: "nama.nim@student.itera.ac.id" },
        { id: "whatsapp", type: "short_text", label: "No. WhatsApp", required: true },
        { id: "angkatan", type: "short_text", label: "Angkatan", required: true, placeholder: "Contoh: 2022" },
        { id: "prodi", type: "short_text", label: "Program Studi", required: true },
    ];

    const allFields = [...fixedFields, ...dynamicFields, ...pmkFields];

    // Dynamically build Zod schema
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    allFields.forEach((field) => {
        let validator;
        if (field.type === "file_upload") {
            validator = z.custom<File>().refine(
                (file) => !file || file.type === 'application/pdf',
                { message: 'File harus berformat PDF' }
            ).refine(
                (file) => !file || file.size <= 5 * 1024 * 1024,
                { message: 'Ukuran file maksimal 5 MB' }
            );
            if (field.required) {
                validator = validator.refine((file) => file !== undefined && file !== null, {
                    message: `${field.label} wajib diupload.`,
                });
            }
        } else if (field.type === "checkbox" && field.options && field.options.length > 0) {
            validator = z.array(z.string());
            if (field.required) {
                validator = validator.min(1, `Pilih minimal satu opsi untuk ${field.label}.`);
            }
        } else if (field.type === "checkbox") {
            validator = z.boolean();
            if (field.required) {
                validator = validator.refine((val) => val === true, {
                    message: "Anda harus menyetujui pernyataan ini.",
                });
            }
        } else {
            validator = z.string();
            if (field.required) {
                validator = validator.min(1, `${field.label} wajib diisi.`);
            } else {
                validator = validator.optional().or(z.literal(""));
            }
        }
        schemaShape[field.id] = validator;
    });

    const formSchema = z.object(schemaShape).superRefine((data, ctx) => {
        const allowedAngkatan = recruitment.allowed_angkatan || [2024];
        let isAngkatanValid = false;

        // 1. Validasi Angkatan
        if (data.angkatan) {
            const angkatanVal = parseInt(String(data.angkatan));
            if (!allowedAngkatan.includes(angkatanVal)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Angkatan ${String(data.angkatan)} tidak termasuk yang diperbolehkan mendaftar.`,
                    path: ["angkatan"],
                });
            } else {
                isAngkatanValid = true;
            }
        }

        // 2. Validasi NIM
        if (data.applicant_nim) {
            const nimStr = String(data.applicant_nim);

            if (!/^[0-9]{9}$/.test(nimStr)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Format NIM tidak valid (harus 9 digit angka).",
                    path: ["applicant_nim"],
                });
            } else if (isAngkatanValid && data.angkatan) {
                const angkatanSuffix = String(data.angkatan).substring(2, 4); // Misal: "24" dari "2024"
                const nimSuffix = nimStr.substring(1, 3); // Misal: "24" dari "124"

                if (angkatanSuffix !== nimSuffix) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "NIM kamu tidak sesuai dengan Angkatan yang dimasukkan.",
                        path: ["applicant_nim"],
                    });
                }
            }
        }

        // 3. Validasi Email ITERA
        if (data.applicant_email) {
            const emailStr = String(data.applicant_email);
            const emailRegex = /^[a-zA-Z]+\.[0-9]{9}@student\.itera\.ac\.id$/;

            if (!emailRegex.test(emailStr)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Gunakan email ITERA: namaDepan.nim@student.itera.ac.id",
                    path: ["applicant_email"],
                });
            } else if (data.applicant_nim) {
                const emailNimMatch = emailStr.match(/\.([0-9]{9})@/);
                if (emailNimMatch && emailNimMatch[1] !== data.applicant_nim) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "NIM pada email harus sama dengan NIM yang diinput.",
                        path: ["applicant_email"],
                    });
                }
            }
        }
    });

    const form = useForm({
        resolver: zodResolver(formSchema),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        defaultValues: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSubmit = async (values: any) => {
        setIsSubmitting(true);
        try {
            // 0. Cek apakah NIM sudah pernah mendaftar di recruitment ini
            const { count, error: countError } = await supabase
                .from("submissions")
                .select("id", { count: 'exact', head: true })
                .eq("recruitment_id", recruitment.id)
                .eq("applicant_nim", values.applicant_nim);

            if (countError) throw new Error("Gagal memvalidasi data pendaftar.");
            if (count && count > 0) {
                throw new Error(`NIM ${values.applicant_nim} sudah terdaftar pada rekrutmen ini.`);
            }

            // 1. Upload files first
            const fileUrls: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const answers: Record<string, any> = {};

            for (const field of allFields) {
                if (["applicant_name", "applicant_nim", "applicant_email"].includes(field.id)) {
                    continue; // These go to dedicated columns
                }

                if (field.type === "file_upload" && values[field.id]) {
                    const file = values[field.id] as File;

                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("recruitmentId", recruitment.id);
                    formData.append("applicantNim", values.applicant_nim);

                    const result = await uploadFile(formData);

                    if (!result.success || !result.url) {
                        throw new Error(result.error || `Gagal mengupload file ${field.label}`);
                    }

                    fileUrls.push(result.url);
                    answers[field.label] = result.url; // Keep a reference in answers too
                } else {
                    answers[field.label] = values[field.id];
                }
            }

            // 2. Insert to submissions table
            const { error: insertError } = await supabase.from("submissions").insert({
                recruitment_id: recruitment.id,
                applicant_name: values.applicant_name,
                applicant_email: values.applicant_email,
                applicant_nim: values.applicant_nim,
                answers,
                files: fileUrls.length > 0 ? fileUrls : null,
                submitted_at: new Date().toISOString(),
            });

            if (insertError) {
                console.error("Insert error", insertError);
                throw new Error("Gagal menyimpan data pendaftaran.");
            }

            // 3. Revalidate dashboard stats
            await revalidateAdminData(recruitment.id);

            // 4. Redirect to success
            router.push(`/recruitment/${recruitment.slug}/success`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            alert(error.message || "Terjadi kesalahan. Silakan coba lagi.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl w-full mx-auto pb-24 px-4 sm:px-6 relative z-10">
            <div className="mb-6">
                <Button variant="ghost" asChild className="hover:bg-primary/10 text-primary">
                    <Link href="/">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Beranda
                    </Link>
                </Button>
            </div>

            <Card className="border-t-8 border-t-accent shadow-xl bg-[#FAF6F0] rounded-3xl overflow-hidden">
                <CardHeader className="bg-white pb-8 border-b border-border/50">
                    <div className="w-full flex items-center justify-center">
                        <div className="relative w-32 h-32 md:w-40 md:h-40 mb-2 rounded-full border-4 border-accent shadow-lg bg-white flex items-center justify-center p-2 z-10 overflow-hidden">
                            <Image
                                src="https://res.cloudinary.com/dm3zixaz4/image/upload/v1772567328/PMK_LOGO-removebg-preview_oydcdq.avif"
                                alt="PMK ITERA Logo"
                                width={150}
                                height={150}
                                className="object-contain"
                                priority
                            />
                        </div>
                    </div>
                    <CardTitle className="font-serif text-3xl md:text-4xl text-primary font-bold">{recruitment.title}</CardTitle>
                    <CardDescription className="text-base text-foreground/80 mt-4 whitespace-pre-wrap leading-relaxed">
                        {recruitment.description}
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-8">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                            <div className="space-y-6">
                                <h3 className="font-serif text-2xl font-semibold text-foreground border-b-2 border-accent/30 pb-2">Identitas Diri</h3>
                                {fixedFields.map((field) => (
                                    <FormFieldRenderer key={field.id} fieldConfig={field} control={form.control} />
                                ))}
                            </div>

                            {dynamicFields.length > 0 && (
                                <div className="space-y-6 pt-6">
                                    <h3 className="font-serif text-2xl font-semibold text-foreground border-b-2 border-accent/30 pb-2">Pertanyaan Pelayanan</h3>
                                    {dynamicFields.map((field) => (
                                        <FormFieldRenderer key={field.id} fieldConfig={field} control={form.control} />
                                    ))}
                                </div>
                            )}

                            <div className="space-y-6 pt-6 bg-highlight/30 p-6 rounded-3xl border border-accent/20">
                                <h3 className="font-serif text-2xl font-semibold text-foreground border-b-2 border-accent/30 pb-2">Spiritualitas</h3>
                                {pmkFields.map((field) => (
                                    <FormFieldRenderer key={field.id} fieldConfig={field} control={form.control} />
                                ))}
                            </div>

                            <div className="pt-8">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full text-lg py-6 bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl shadow-lg transition-transform hover:scale-[1.01]"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-6 h-6 mr-3 animate-spin" /> Sedang Mengirim...
                                        </>
                                    ) : (
                                        "Kirim Pendaftaran"
                                    )}
                                </Button>
                                <p className="text-center text-sm text-muted-foreground mt-4 font-medium italic">
                                    Pastikan semua data sudah terisi dengan benar. Tuhan senantiasa menyertai.
                                </p>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
