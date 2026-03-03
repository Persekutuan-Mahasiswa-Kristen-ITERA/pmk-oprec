"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
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
        { id: "applicant_email", type: "short_text", label: "Email", required: true, placeholder: "email@example.com" },
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
            validator = z.any();
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

    const formSchema = z.object(schemaShape);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {},
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSubmit = async (values: any) => {
        setIsSubmitting(true);
        try {
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
                    const fileName = `${recruitment.id}/${values.applicant_nim}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

                    const { error } = await supabase.storage
                        .from("recruitment-files")
                        .upload(fileName, file);

                    if (error) {
                        console.error("Upload error", error);
                        throw new Error(`Gagal mengupload file ${field.label}`);
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from("recruitment-files")
                        .getPublicUrl(fileName);

                    fileUrls.push(publicUrl);
                    answers[field.label] = publicUrl; // Keep a reference in answers too
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

            // 3. Redirect to success
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
